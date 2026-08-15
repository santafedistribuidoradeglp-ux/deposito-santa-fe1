from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import unicodedata
import urllib.parse
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get('ADMIN_EMAILS', '').split(',') if e.strip()]
LOCAL_TZ = ZoneInfo("America/Fortaleza")

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class SessionExchange(BaseModel):
    session_id: str


class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "customer"
    phone: Optional[str] = None
    saved_address: Optional[dict] = None
    order_count: int = 0


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    card_price: Optional[float] = None
    description: str = ""
    tag: str = ""
    visual: str = ""
    image_url: str = ""
    active: bool = True


class ProductInput(BaseModel):
    name: str
    price: float
    card_price: Optional[float] = None
    description: str = ""
    tag: str = ""
    visual: str = ""
    image_url: str = ""
    active: bool = True


class Address(BaseModel):
    cep: str
    street: str
    number: str
    complement: str = ""
    neighborhood: str = ""
    city: str


class OrderItem(BaseModel):
    product_id: str
    name: str
    price: float
    qty: int


class OrderInput(BaseModel):
    customer_name: str
    phone: str
    items: List[OrderItem]
    payment_method: str
    address: Address
    note: str = ""


class SettingsInput(BaseModel):
    whatsapp_number: str
    hours_weekday_open: str
    hours_weekday_close: str
    hours_sunday_open: str
    hours_sunday_close: str
    loyalty_discount_percent: float = 10.0


# ---------- Auth helpers ----------
async def get_current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    return user


async def require_user(request: Request) -> dict:
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Não autenticado")
    return user


async def require_admin(request: Request) -> dict:
    user = await require_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return user


# ---------- Auth routes ----------
@api_router.post("/auth/session")
async def exchange_session(body: SessionExchange, response: Response):
    async with httpx.AsyncClient() as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    data = r.json()
    email = data["email"].lower()
    role = "admin" if email in ADMIN_EMAILS else "customer"

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data["name"], "picture": data.get("picture"), "role": role}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data["name"],
            "picture": data.get("picture"),
            "role": role,
            "phone": None,
            "saved_address": None,
            "order_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie(
        key="session_token", value=session_token, httponly=True,
        secure=True, samesite="none", path="/", max_age=7 * 24 * 3600,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(require_user)):
    return user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Products ----------
@api_router.get("/products")
async def list_products():
    return await db.products.find({"active": True}, {"_id": 0}).to_list(100)


@api_router.get("/admin/products")
async def admin_list_products(admin: dict = Depends(require_admin)):
    return await db.products.find({}, {"_id": 0}).to_list(100)


@api_router.post("/admin/products")
async def create_product(body: ProductInput, admin: dict = Depends(require_admin)):
    product = Product(**body.model_dump())
    await db.products.insert_one(product.model_dump())
    return product


@api_router.put("/admin/products/{product_id}")
async def update_product(product_id: str, body: ProductInput, admin: dict = Depends(require_admin)):
    result = await db.products.update_one({"id": product_id}, {"$set": body.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api_router.delete("/admin/products/{product_id}")
async def delete_product(product_id: str, admin: dict = Depends(require_admin)):
    await db.products.delete_one({"id": product_id})
    return {"ok": True}


# ---------- Settings ----------
def store_is_open(settings: dict) -> bool:
    now = datetime.now(LOCAL_TZ)
    if now.weekday() == 6:
        o, c = settings["hours_sunday_open"], settings["hours_sunday_close"]
    else:
        o, c = settings["hours_weekday_open"], settings["hours_weekday_close"]
    current = now.strftime("%H:%M")
    return o <= current < c


@api_router.get("/settings")
async def get_settings():
    s = await db.settings.find_one({"key": "store"}, {"_id": 0})
    s["store_open"] = store_is_open(s)
    return s


@api_router.put("/admin/settings")
async def update_settings(body: SettingsInput, admin: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "store"}, {"$set": body.model_dump()})
    s = await db.settings.find_one({"key": "store"}, {"_id": 0})
    s["store_open"] = store_is_open(s)
    return s


# ---------- Orders ----------
def normalize(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().strip()


def format_brl(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def build_whatsapp_message(order: dict, loyalty: bool, discount_percent: float) -> str:
    lines = ["*NOVO PEDIDO - Santa Fé Distribuidora*", ""]
    lines.append(f"*Cliente:* {order['customer_name']}")
    lines.append(f"*Telefone:* {order['phone']}")
    lines.append("")
    lines.append("*Itens:*")
    for item in order["items"]:
        lines.append(f"- {item['qty']}x {item['name']} — {format_brl(item['price'] * item['qty'])}")
    lines.append("")
    lines.append(f"*Total: {format_brl(order['total'])}*")
    lines.append(f"*Pagamento:* {order['payment_method']}")
    a = order["address"]
    addr = f"{a['street']}, {a['number']}"
    if a.get("complement"):
        addr += f" ({a['complement']})"
    addr += f" - {a['neighborhood']}, {a['city']} - CEP {a['cep']}"
    lines.append(f"*Endereço:* {addr}")
    if order.get("note"):
        lines.append(f"*Obs:* {order['note']}")
    if loyalty:
        lines.append("")
        lines.append(f"🎁 *Cliente tem desconto de fidelidade ({discount_percent:.0f}%)!*")
    return "\n".join(lines)


@api_router.post("/orders")
async def create_order(body: OrderInput, request: Request):
    if "joao pessoa" not in normalize(body.address.city):
        raise HTTPException(status_code=400, detail="Só entregamos em João Pessoa")
    if not body.items:
        raise HTTPException(status_code=400, detail="Pedido vazio")

    user = await get_current_user(request)
    settings = await db.settings.find_one({"key": "store"}, {"_id": 0})
    total = sum(i.price * i.qty for i in body.items)

    loyalty = False
    if user:
        count = user.get("order_count", 0)
        if count % 11 == 10:
            loyalty = True

    order = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"] if user else None,
        "customer_name": body.customer_name,
        "phone": body.phone,
        "items": [i.model_dump() for i in body.items],
        "total": total,
        "payment_method": body.payment_method,
        "address": body.address.model_dump(),
        "note": body.note,
        "loyalty_discount": loyalty,
        "status": "enviado",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one({**order})

    if user:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$inc": {"order_count": 1},
             "$set": {"phone": body.phone, "saved_address": body.address.model_dump()}},
        )

    discount_percent = settings.get("loyalty_discount_percent", 10.0)
    message = build_whatsapp_message(order, loyalty, discount_percent)
    number = settings["whatsapp_number"]
    whatsapp_url = f"https://wa.me/{number}?text={urllib.parse.quote(message)}"
    return {"order": order, "whatsapp_url": whatsapp_url, "phone_fallback": f"tel:+{number}", "loyalty_discount": loyalty}


@api_router.get("/orders/my")
async def my_orders(user: dict = Depends(require_user)):
    orders = await db.orders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return orders


@api_router.get("/loyalty/me")
async def loyalty_me(user: dict = Depends(require_user)):
    count = user.get("order_count", 0)
    cycle = count % 11
    return {
        "order_count": count,
        "cycle_progress": cycle,
        "next_is_discount": cycle == 10,
        "remaining": 10 - cycle if cycle < 10 else 0,
    }


@api_router.get("/admin/orders")
async def admin_orders(admin: dict = Depends(require_admin)):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


class StatusUpdate(BaseModel):
    status: str


@api_router.put("/admin/orders/{order_id}/status")
async def update_order_status(order_id: str, body: StatusUpdate, admin: dict = Depends(require_admin)):
    result = await db.orders.update_one({"id": order_id}, {"$set": {"status": body.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return {"ok": True}


@api_router.get("/admin/clients")
async def admin_clients(admin: dict = Depends(require_admin)):
    return await db.users.find({"role": "customer"}, {"_id": 0}).sort("order_count", -1).to_list(1000)


@api_router.get("/")
async def root():
    return {"message": "Santa Fe API"}


# ---------- Seed ----------
@app.on_event("startup")
async def seed():
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([
            {"id": str(uuid.uuid4()), "name": "Gás P13 Supergasbras", "price": 120.0, "card_price": 125.0,
             "description": "Botijão 13 kg", "tag": "Mais pedido", "visual": "gas-gold", "image_url": "", "active": True},
            {"id": str(uuid.uuid4()), "name": "Água Mineral Sublime", "price": 17.0, "card_price": None,
             "description": "Galão 20 litros", "tag": "Água mineral", "visual": "water-blue", "image_url": "", "active": True},
            {"id": str(uuid.uuid4()), "name": "Água Mineral Itacoatiara", "price": 15.0, "card_price": None,
             "description": "Galão 20 litros", "tag": "Água mineral", "visual": "water-light", "image_url": "", "active": True},
        ])
    if not await db.settings.find_one({"key": "store"}):
        await db.settings.insert_one({
            "key": "store",
            "whatsapp_number": "5583999170131",
            "hours_weekday_open": "07:00",
            "hours_weekday_close": "19:00",
            "hours_sunday_open": "07:00",
            "hours_sunday_close": "19:00",
            "loyalty_discount_percent": 10.0,
        })


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
