from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import io
import logging
import uuid
import secrets
import unicodedata
import urllib.parse
import httpx
import requests as pyrequests
import bcrypt
import qrcode
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

# ---------- Object storage (Emergent) ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "santafe"
storage_key = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = pyrequests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = pyrequests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = pyrequests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = pyrequests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- Password helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def gen_referral_code() -> str:
    return f"SF{secrets.token_hex(3).upper()}"

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class SessionExchange(BaseModel):
    session_id: str


class RegisterInput(BaseModel):
    name: str
    phone: str
    password: str
    account_type: str = "cliente"
    business_name: str = ""
    business_address: str = ""
    facade_path: str = ""


class LoginInput(BaseModel):
    phone: str
    password: str


class CouponInput(BaseModel):
    code: str
    type: str = "fixed"
    value: float
    first_purchase_only: bool = False
    active: bool = True


class CouponValidateInput(BaseModel):
    code: str


class BusinessStatusInput(BaseModel):
    status: str


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
    coupon_code: str = ""
    use_credit: bool = False
    referral_code: str = ""


class SettingsInput(BaseModel):
    whatsapp_number: str
    hours_weekday_open: str
    hours_weekday_close: str
    hours_sunday_open: str
    hours_sunday_close: str
    loyalty_discount_percent: float = 10.0
    referral_credit_value: float = 5.0


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
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
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
    if email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Login Google é exclusivo para administradores. Use telefone e senha.")
    role = "admin"

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


async def create_phone_session(user_id: str, response: Response) -> str:
    token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie(key="session_token", value=token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 24 * 3600)
    return token


@api_router.post("/auth/register")
async def register(body: RegisterInput, response: Response):
    phone = re.sub(r"\D", "", body.phone)
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Telefone inválido — use DDD + número")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 6 caracteres")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Informe seu nome")
    if body.account_type == "comercio" and not body.business_name.strip():
        raise HTTPException(status_code=400, detail="Informe o nome do comércio")
    existing = await db.users.find_one({"phone": phone, "auth_type": "phone"})
    if existing:
        raise HTTPException(status_code=400, detail="Telefone já cadastrado. Faça login.")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "name": body.name.strip(),
        "phone": phone,
        "email": None,
        "picture": None,
        "password_hash": hash_password(body.password),
        "auth_type": "phone",
        "role": "customer",
        "account_type": body.account_type if body.account_type in ("cliente", "comercio") else "cliente",
        "referral_code": gen_referral_code(),
        "referral_unlocked": False,
        "referral_credit": 0.0,
        "order_count": 0,
        "saved_address": None,
        "business_name": body.business_name.strip(),
        "business_address": body.business_address.strip(),
        "facade_path": body.facade_path,
        "business_status": "pendente" if body.account_type == "comercio" else "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await create_phone_session(user_id, response)
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})


@api_router.post("/auth/login")
async def login_phone(body: LoginInput, request: Request, response: Response):
    phone = re.sub(r"\D", "", body.phone)
    ip = request.client.host if request.client else "?"  # noqa: F841
    identifier = phone
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    attempts = await db.login_attempts.count_documents({"identifier": identifier, "at": {"$gte": cutoff.isoformat()}})
    if attempts >= 5:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde 15 minutos.")
    user = await db.users.find_one({"phone": phone, "auth_type": "phone"})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.insert_one({"identifier": identifier, "at": datetime.now(timezone.utc).isoformat()})
        raise HTTPException(status_code=401, detail="Telefone ou senha incorretos")
    await db.login_attempts.delete_many({"identifier": identifier})
    await create_phone_session(user["user_id"], response)
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})


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
    if order.get("account_type") == "comercio":
        lines.append("*Tipo:* COMÉRCIO (preço a combinar)")
    lines.append(f"*Cliente:* {order['customer_name']}")
    lines.append(f"*Telefone:* {order['phone']}")
    lines.append("")
    lines.append("*Itens:*")
    for item in order["items"]:
        if order.get("price_negotiable"):
            lines.append(f"- {item['qty']}x {item['name']} — a combinar")
        else:
            lines.append(f"- {item['qty']}x {item['name']} — {format_brl(item['price'] * item['qty'])}")
    lines.append("")
    if order.get("price_negotiable"):
        lines.append("*Total: a combinar*")
        if order.get("credit_used", 0) > 0:
            lines.append(f"🎟️ *Abater {format_brl(order['credit_used'])} de crédito de indicação (já descontado do saldo do cliente)*")
    else:
        if order.get("subtotal") and order["subtotal"] != order["total"]:
            lines.append(f"Subtotal: {format_brl(order['subtotal'])}")
        if order.get("coupon_discount", 0) > 0:
            lines.append(f"Cupom {order.get('coupon_code','')}: -{format_brl(order['coupon_discount'])}")
        if order.get("credit_used", 0) > 0:
            lines.append(f"Crédito de indicação: -{format_brl(order['credit_used'])}")
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
    if order.get("referred_by_code"):
        lines.append(f"📣 Veio por indicação (código {order['referred_by_code']})")
    if loyalty:
        lines.append("")
        lines.append(f"🎁 *Cliente tem desconto de fidelidade ({discount_percent:.0f}%)!*")
    return "\n".join(lines)


def has_p13(items) -> bool:
    return any("p13" in normalize(i.name) for i in items)


@api_router.post("/orders")
async def create_order(body: OrderInput, request: Request):
    if "joao pessoa" not in normalize(body.address.city):
        raise HTTPException(status_code=400, detail="Só entregamos em João Pessoa")
    if not body.items:
        raise HTTPException(status_code=400, detail="Pedido vazio")

    user = await get_current_user(request)
    settings = await db.settings.find_one({"key": "store"}, {"_id": 0})
    is_business = bool(user and user.get("account_type") == "comercio")

    subtotal = 0.0 if is_business else sum(i.price * i.qty for i in body.items)

    coupon_discount = 0.0
    coupon_code = ""
    if body.coupon_code and not is_business:
        coupon = await db.coupons.find_one({"code": body.coupon_code.strip().upper(), "active": True}, {"_id": 0})
        if not coupon:
            raise HTTPException(status_code=400, detail="Cupom inválido ou inativo")
        if coupon.get("first_purchase_only"):
            if not user:
                raise HTTPException(status_code=400, detail="Cupom de primeira compra: faça login para usar")
            if user.get("order_count", 0) > 0:
                raise HTTPException(status_code=400, detail="Cupom válido apenas na primeira compra")
        coupon_code = coupon["code"]
        coupon_discount = round(subtotal * coupon["value"] / 100, 2) if coupon["type"] == "percent" else min(coupon["value"], subtotal)

    credit_used = 0.0
    if body.use_credit and user:
        available = float(user.get("referral_credit", 0) or 0)
        if available > 0:
            credit_used = available if is_business else min(available, max(subtotal - coupon_discount, 0))
            credit_used = round(credit_used, 2)

    total = 0.0 if is_business else round(max(subtotal - coupon_discount - credit_used, 0), 2)

    loyalty = False
    if user and not is_business:
        if user.get("order_count", 0) % 11 == 10:
            loyalty = True

    referred_by_code = ""
    ref_code = body.referral_code.strip().upper()
    if ref_code and has_p13(body.items):
        ref_user = await db.users.find_one({"referral_code": ref_code}, {"_id": 0, "password_hash": 0})
        if ref_user and ref_user.get("referral_unlocked") and (not user or user["user_id"] != ref_user["user_id"]):
            await db.users.update_one({"user_id": ref_user["user_id"]}, {"$inc": {"referral_credit": float(settings.get("referral_credit_value", 5.0))}})
            referred_by_code = ref_code

    order = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"] if user else None,
        "account_type": user.get("account_type", "cliente") if user else "cliente",
        "customer_name": body.customer_name,
        "phone": body.phone,
        "items": [i.model_dump() for i in body.items],
        "subtotal": subtotal,
        "coupon_code": coupon_code,
        "coupon_discount": coupon_discount,
        "credit_used": credit_used,
        "total": total,
        "price_negotiable": is_business,
        "payment_method": body.payment_method,
        "address": body.address.model_dump(),
        "note": body.note,
        "loyalty_discount": loyalty,
        "referred_by_code": referred_by_code,
        "status": "enviado",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one({**order})

    if user:
        updates = {"$inc": {"order_count": 1}, "$set": {"phone": body.phone, "saved_address": body.address.model_dump()}}
        if credit_used > 0:
            updates["$inc"]["referral_credit"] = -credit_used
        if has_p13(body.items):
            updates["$set"]["referral_unlocked"] = True
        await db.users.update_one({"user_id": user["user_id"]}, updates)

    discount_percent = settings.get("loyalty_discount_percent", 10.0)
    message = build_whatsapp_message(order, loyalty, discount_percent)
    number = settings["whatsapp_number"]
    whatsapp_url = f"https://wa.me/{number}?text={urllib.parse.quote(message)}"
    unlocked_now = bool(user and not user.get("referral_unlocked") and has_p13(body.items))
    return {"order": order, "whatsapp_url": whatsapp_url, "phone_fallback": f"tel:+{number}",
            "loyalty_discount": loyalty, "referral_unlocked_now": unlocked_now}


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
    return await db.users.find({"role": "customer"}, {"_id": 0, "password_hash": 0}).sort("order_count", -1).to_list(1000)


# ---------- Referral ----------
@api_router.get("/referral/me")
async def referral_me(user: dict = Depends(require_user)):
    if not user.get("referral_code"):
        code = gen_referral_code()
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
        user["referral_code"] = code
    settings = await db.settings.find_one({"key": "store"}, {"_id": 0})
    return {
        "unlocked": bool(user.get("referral_unlocked")),
        "code": user["referral_code"],
        "credit": float(user.get("referral_credit", 0) or 0),
        "credit_value": float(settings.get("referral_credit_value", 5.0)),
    }


@api_router.get("/referral/qr")
async def referral_qr(link: str, user: dict = Depends(require_user)):
    img = qrcode.make(link)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


# ---------- Coupons ----------
@api_router.post("/coupons/validate")
async def validate_coupon(body: CouponValidateInput, request: Request):
    coupon = await db.coupons.find_one({"code": body.code.strip().upper(), "active": True}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=400, detail="Cupom inválido ou inativo")
    if coupon.get("first_purchase_only"):
        user = await get_current_user(request)
        if not user:
            raise HTTPException(status_code=400, detail="Cupom de primeira compra: faça login para usar")
        if user.get("order_count", 0) > 0:
            raise HTTPException(status_code=400, detail="Cupom válido apenas na primeira compra")
    return coupon


@api_router.get("/admin/coupons")
async def admin_coupons(admin: dict = Depends(require_admin)):
    return await db.coupons.find({}, {"_id": 0}).to_list(200)


@api_router.post("/admin/coupons")
async def create_coupon(body: CouponInput, admin: dict = Depends(require_admin)):
    code = body.code.strip().upper()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(status_code=400, detail="Já existe um cupom com esse código")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "code": code}
    await db.coupons.insert_one({**doc})
    return doc


@api_router.put("/admin/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, body: CouponInput, admin: dict = Depends(require_admin)):
    result = await db.coupons.update_one({"id": coupon_id}, {"$set": {**body.model_dump(), "code": body.code.strip().upper()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cupom não encontrado")
    return await db.coupons.find_one({"id": coupon_id}, {"_id": 0})


@api_router.delete("/admin/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, admin: dict = Depends(require_admin)):
    await db.coupons.delete_one({"id": coupon_id})
    return {"ok": True}


# ---------- Businesses ----------
@api_router.get("/businesses")
async def list_businesses():
    users = await db.users.find(
        {"account_type": "comercio", "business_status": "aprovado"},
        {"_id": 0, "business_name": 1, "business_address": 1, "facade_path": 1, "name": 1},
    ).to_list(500)
    return [{
        "business_name": u.get("business_name"),
        "business_address": u.get("business_address"),
        "facade_url": f"/api/files/{u['facade_path']}" if u.get("facade_path") else None,
    } for u in users]


@api_router.get("/admin/businesses")
async def admin_businesses(admin: dict = Depends(require_admin)):
    return await db.users.find({"account_type": "comercio"}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)


@api_router.put("/admin/businesses/{user_id}/status")
async def set_business_status(user_id: str, body: BusinessStatusInput, admin: dict = Depends(require_admin)):
    if body.status not in ("pendente", "aprovado", "recusado"):
        raise HTTPException(status_code=400, detail="Status inválido")
    result = await db.users.update_one({"user_id": user_id, "account_type": "comercio"}, {"$set": {"business_status": body.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Comércio não encontrado")
    return {"ok": True}


# ---------- File upload / serve ----------
MIME_OK = {"image/jpeg", "image/png", "image/webp"}


@api_router.post("/upload/facade")
async def upload_facade(file: UploadFile = File(...)):
    if file.content_type not in MIME_OK:
        raise HTTPException(status_code=400, detail="Envie uma imagem JPG, PNG ou WebP")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx 5MB)")
    ext = "jpg" if file.content_type == "image/jpeg" else file.content_type.split("/")[1]
    path = f"{APP_NAME}/facades/{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type)
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"]}


@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type))


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
            "referral_credit_value": 5.0,
        })
    await db.settings.update_one({"key": "store", "referral_credit_value": {"$exists": False}}, {"$set": {"referral_credit_value": 5.0}})
    await db.users.create_index("phone")
    await db.login_attempts.create_index("identifier")
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


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
