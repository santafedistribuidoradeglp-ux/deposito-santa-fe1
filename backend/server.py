from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import io
import hmac
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


class ForgotInput(BaseModel):
    phone: str


class ResetInput(BaseModel):
    phone: str
    code: str
    new_password: str


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


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
    pickup_price: Optional[float] = None
    description: str = ""
    tag: str = ""
    visual: str = ""
    image_url: str = ""
    active: bool = True


class ProductInput(BaseModel):
    name: str
    price: float
    card_price: Optional[float] = None
    pickup_price: Optional[float] = None
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
    cpf: str = ""


class SettingsInput(BaseModel):
    whatsapp_number: str
    hours_weekday_open: str
    hours_weekday_close: str
    hours_sunday_open: str
    hours_sunday_close: str
    loyalty_discount_value: float = 10.0
    referral_credit_value: float = 5.0
    ranking_bonus_value: float = 10.0
    promo_title: str = ""
    promo_text: str = ""


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
    return await db.products.find({"active": True}, {"_id": 0}).sort("sort_order", 1).to_list(100)


@api_router.get("/admin/products")
async def admin_list_products(admin: dict = Depends(require_admin)):
    return await db.products.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)


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
    s["closing_soon"] = False
    s["minutes_to_close"] = None
    if s["store_open"]:
        now = datetime.now(LOCAL_TZ)
        close = s["hours_sunday_close"] if now.weekday() == 6 else s["hours_weekday_close"]
        ch, cm = map(int, close.split(":"))
        minutes_left = (ch * 60 + cm) - (now.hour * 60 + now.minute)
        if 0 < minutes_left <= 30:
            s["closing_soon"] = True
            s["minutes_to_close"] = minutes_left
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


def _wa_header_lines(order: dict) -> list:
    lines = ["*NOVO PEDIDO - Santa Fé Distribuidora*", ""]
    if order.get("is_gas_do_povo"):
        lines.append("*PEDIDO GÁS DO POVO — verificar benefício/CPF do cliente*")
    if order.get("account_type") == "comercio":
        lines.append("*Tipo:* COMÉRCIO (preço a combinar)")
    lines.append(f"*Cliente:* {order['customer_name']}")
    lines.append(f"*Telefone:* {order['phone']}")
    if order.get("cpf"):
        lines.append(f"*CPF (Gás do Povo):* {order['cpf']}")
    return lines


def _wa_item_lines(order: dict) -> list:
    lines = ["", "*Itens:*"]
    for item in order["items"]:
        if order.get("price_negotiable"):
            lines.append(f"- {item['qty']}x {item['name']} — a combinar")
        elif "gas do povo" in normalize(item["name"]):
            lines.append(f"- {item['qty']}x {item['name']} — taxa de entrega {format_brl(item['price'] * item['qty'])}")
        else:
            lines.append(f"- {item['qty']}x {item['name']} — {format_brl(item['price'] * item['qty'])}")
    return lines


def _wa_total_lines(order: dict) -> list:
    lines = [""]
    if order.get("price_negotiable"):
        lines.append("*Total: a combinar*")
        if order.get("credit_used", 0) > 0:
            lines.append(f"🎟️ *Abater {format_brl(order['credit_used'])} de crédito de indicação (já descontado do saldo do cliente)*")
        return lines
    if order.get("subtotal") and order["subtotal"] != order["total"]:
        lines.append(f"Subtotal: {format_brl(order['subtotal'])}")
    if order.get("coupon_discount", 0) > 0:
        lines.append(f"Cupom {order.get('coupon_code','')}: -{format_brl(order['coupon_discount'])}")
    if order.get("credit_used", 0) > 0:
        lines.append(f"Crédito de indicação: -{format_brl(order['credit_used'])}")
    lines.append(f"*Total: {format_brl(order['total'])}*")
    return lines


def _wa_footer_lines(order: dict) -> list:
    a = order["address"]
    addr = f"{a['street']}, {a['number']}"
    if a.get("complement"):
        addr += f" ({a['complement']})"
    addr += f" - {a['neighborhood']}, {a['city']} - CEP {a['cep']}"
    lines = [f"*Pagamento:* {order['payment_method']}", f"*Endereço:* {addr}"]
    if order.get("note"):
        lines.append(f"*Obs:* {order['note']}")
    if order.get("referred_by_code"):
        lines.append(f"📣 Veio por indicação (código {order['referred_by_code']})")
    return lines


def build_whatsapp_message(order: dict) -> str:
    return "\n".join(_wa_header_lines(order) + _wa_item_lines(order) + _wa_total_lines(order) + _wa_footer_lines(order))


def has_p13(items) -> bool:
    return any("p13" in normalize(i.name) for i in items)


def has_agua(items) -> bool:
    return any("agua" in normalize(i.name) for i in items)


def has_gdp(items) -> bool:
    return any("gas do povo" in normalize(i.name) for i in items)


def _coupon_discount_value(coupon: dict, subtotal: float) -> float:
    if coupon["type"] == "percent":
        return round(subtotal * coupon["value"] / 100, 2)
    return min(coupon["value"], subtotal)


async def _auto_gdp_coupon(body: "OrderInput", user, is_business: bool, is_gdp: bool, subtotal: float):
    eligible = not body.coupon_code and is_gdp and user and not is_business and not user.get("gdp_first_used")
    if not eligible:
        return "", 0.0
    auto = await db.coupons.find_one({"code": "GASDOPOVO10", "active": True}, {"_id": 0})
    if not auto:
        return "", 0.0
    return auto["code"], _coupon_discount_value(auto, subtotal)


async def _resolve_manual_coupon(body: "OrderInput", user, is_gdp: bool) -> dict:
    coupon = await db.coupons.find_one({"code": body.coupon_code.strip().upper(), "active": True}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=400, detail="Cupom inválido ou inativo")
    if coupon.get("single_use") and coupon.get("used"):
        raise HTTPException(status_code=400, detail="Este cupom já foi utilizado")
    if coupon.get("owner_user_id") and (not user or user["user_id"] != coupon["owner_user_id"]):
        raise HTTPException(status_code=400, detail="Este cupom é pessoal — faça login com a conta que o ganhou")
    if coupon.get("product_scope") == "p13" and not has_p13(body.items):
        raise HTTPException(status_code=400, detail="Este cupom só vale para pedidos com botijão de gás P13")
    if coupon.get("product_scope") == "agua" and not has_agua(body.items):
        raise HTTPException(status_code=400, detail="Este cupom só vale para pedidos com água mineral")
    if coupon.get("product_scope") == "gasdopovo" and not is_gdp:
        raise HTTPException(status_code=400, detail="Este cupom só vale para pedidos de Gás do Povo")
    if coupon.get("first_purchase_only"):
        if not user:
            raise HTTPException(status_code=400, detail="Cupom de primeira compra: faça login para usar")
        if user.get("order_count", 0) > 0:
            raise HTTPException(status_code=400, detail="Cupom válido apenas na primeira compra")
    return coupon


async def _grant_referral_credit(body: "OrderInput", user, settings: dict) -> str:
    ref_code = body.referral_code.strip().upper()
    if not ref_code or not has_p13(body.items):
        return ""
    ref_user = await db.users.find_one({"referral_code": ref_code}, {"_id": 0, "password_hash": 0})
    if not ref_user or not ref_user.get("referral_unlocked") or (user and user["user_id"] == ref_user["user_id"]):
        return ""
    credit_val = float(settings.get("referral_credit_value", 5.0))
    await db.users.update_one({"user_id": ref_user["user_id"]}, {"$inc": {"referral_credit": credit_val}})
    first_name = body.customer_name.strip().split(" ")[0] if body.customer_name.strip() else "Alguém"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.referral_events.insert_one({
        "id": str(uuid.uuid4()), "user_id": ref_user["user_id"], "amount": credit_val,
        "from_name": first_name, "seen": False, "created_at": now_iso,
    })
    await db.credit_ledger.insert_one({
        "id": str(uuid.uuid4()), "user_id": ref_user["user_id"], "type": "ganho", "amount": credit_val,
        "description": f"Indicação: {first_name} comprou pelo seu link", "created_at": now_iso,
    })
    return ref_code


async def _apply_post_order_updates(body: "OrderInput", user, settings: dict, credit_used: float, auto_coupon_code: str, is_business: bool):
    updates = {"$inc": {"order_count": 1}, "$set": {"phone": body.phone, "saved_address": body.address.model_dump()}}
    if credit_used > 0:
        updates["$inc"]["referral_credit"] = -credit_used
        await db.credit_ledger.insert_one({
            "id": str(uuid.uuid4()), "user_id": user["user_id"], "type": "uso", "amount": credit_used,
            "description": "Crédito usado em pedido", "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if has_p13(body.items):
        updates["$set"]["referral_unlocked"] = True
    if auto_coupon_code:
        updates["$set"]["gdp_first_used"] = True
    await db.users.update_one({"user_id": user["user_id"]}, updates)
    new_count = user.get("order_count", 0) + 1
    if is_business or new_count % 4 != 3:
        return None
    value = float(settings.get("loyalty_discount_value", 10.0))
    code = f"FIEL{secrets.token_hex(2).upper()}"
    await db.coupons.insert_one({
        "id": str(uuid.uuid4()), "code": code, "type": "fixed", "value": value,
        "first_purchase_only": False, "active": True, "product_scope": "",
        "owner_user_id": user["user_id"], "single_use": True, "used": False,
        "label": "Fidelidade 3/3", "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"code": code, "value": value}


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
    is_gdp = has_gdp(body.items)

    coupon = None
    auto_coupon_code, coupon_discount = await _auto_gdp_coupon(body, user, is_business, is_gdp, subtotal)
    coupon_code = auto_coupon_code
    if body.coupon_code and not is_business:
        coupon = await _resolve_manual_coupon(body, user, is_gdp)
        coupon_code = coupon["code"]
        coupon_discount = _coupon_discount_value(coupon, subtotal)

    credit_used = 0.0
    if body.use_credit and user:
        available = float(user.get("referral_credit", 0) or 0)
        if available > 0:
            credit_used = available if is_business else min(available, max(subtotal - coupon_discount, 0))
            credit_used = round(credit_used, 2)

    total = 0.0 if is_business else round(max(subtotal - coupon_discount - credit_used, 0), 2)

    referred_by_code = await _grant_referral_credit(body, user, settings)

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
        "cpf": re.sub(r"\D", "", body.cpf) if body.cpf else "",
        "is_gas_do_povo": is_gdp,
        "loyalty_discount": False,
        "referred_by_code": referred_by_code,
        "status": "enviado",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one({**order})

    if coupon and coupon.get("single_use"):
        await db.coupons.update_one({"id": coupon["id"]}, {"$set": {"used": True}})

    loyalty_coupon = None
    if user:
        loyalty_coupon = await _apply_post_order_updates(body, user, settings, credit_used, auto_coupon_code, is_business)

    message = build_whatsapp_message(order)
    number = settings["whatsapp_number"]
    whatsapp_url = f"https://wa.me/{number}?text={urllib.parse.quote(message)}"
    unlocked_now = bool(user and not user.get("referral_unlocked") and has_p13(body.items))
    return {"order": order, "whatsapp_url": whatsapp_url, "phone_fallback": f"tel:+{number}",
            "loyalty_coupon": loyalty_coupon, "auto_coupon": auto_coupon_code,
            "referral_unlocked_now": unlocked_now}


@api_router.get("/orders/my")
async def my_orders(user: dict = Depends(require_user)):
    orders = await db.orders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return orders


@api_router.get("/loyalty/me")
async def loyalty_me(user: dict = Depends(require_user)):
    count = user.get("order_count", 0)
    cycle = count % 4
    progress = min(cycle, 3)
    return {
        "order_count": count,
        "cycle_progress": progress,
        "cycle_size": 3,
        "next_is_discount": cycle == 3,
        "remaining": max(3 - cycle, 0),
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


@api_router.delete("/admin/orders/{order_id}")
async def delete_order(order_id: str, admin: dict = Depends(require_admin)):
    result = await db.orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return {"ok": True}


# ---------- Admin report & ranking ----------
@api_router.get("/admin/report")
async def admin_report(days: int = 7, admin: dict = Depends(require_admin)):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    orders = await db.orders.find({"created_at": {"$gte": since}}, {"_id": 0}).to_list(5000)
    prod_count = {}
    for o in orders:
        for it in o["items"]:
            prod_count[it["name"]] = prod_count.get(it["name"], 0) + it["qty"]
    top_products = sorted([{"name": k, "qty": v} for k, v in prod_count.items()], key=lambda x: -x["qty"])
    new_clients = await db.users.count_documents({"role": "customer", "created_at": {"$gte": since}})
    credits = await db.credit_ledger.find({"type": "ganho", "created_at": {"$gte": since}}, {"_id": 0}).to_list(5000)
    return {
        "days": days,
        "total_orders": len(orders),
        "total_revenue": round(sum(o.get("total", 0) for o in orders), 2),
        "negotiable_orders": sum(1 for o in orders if o.get("price_negotiable")),
        "top_products": top_products,
        "new_clients": new_clients,
        "credits_given": round(sum(c["amount"] for c in credits), 2),
    }


@api_router.get("/admin/referral-ranking")
async def referral_ranking(admin: dict = Depends(require_admin)):
    pipeline = [
        {"$group": {"_id": "$user_id", "indications": {"$sum": 1}, "earned": {"$sum": "$amount"}}},
        {"$sort": {"indications": -1}},
        {"$limit": 20},
    ]
    rows = await db.referral_events.aggregate(pipeline).to_list(20)
    user_ids = [r["_id"] for r in rows]
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "name": 1, "phone": 1, "business_name": 1, "account_type": 1, "referral_credit": 1}).to_list(20)
    users_map = {u["user_id"]: u for u in users}
    result = []
    for r in rows:
        u = users_map.get(r["_id"])
        if u:
            result.append({
                "name": u.get("business_name") or u.get("name"),
                "phone": u.get("phone"),
                "account_type": u.get("account_type", "cliente"),
                "indications": r["indications"],
                "earned": round(r["earned"], 2),
                "current_credit": round(float(u.get("referral_credit", 0) or 0), 2),
            })
    return result


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


@api_router.get("/referral/notifications")
async def referral_notifications(user: dict = Depends(require_user)):
    events = await db.referral_events.find({"user_id": user["user_id"], "seen": False}, {"_id": 0}).to_list(50)
    if events:
        await db.referral_events.update_many({"user_id": user["user_id"], "seen": False}, {"$set": {"seen": True}})
    return events


@api_router.get("/referral/ledger")
async def referral_ledger(user: dict = Depends(require_user)):
    return await db.credit_ledger.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------- Password reset (via WhatsApp da loja) ----------
@api_router.post("/auth/forgot")
async def forgot_password(body: ForgotInput):
    phone = re.sub(r"\D", "", body.phone)
    user = await db.users.find_one({"phone": phone, "auth_type": "phone"})
    if not user:
        raise HTTPException(status_code=404, detail="Telefone não encontrado. Verifique o número ou crie uma conta.")
    code = f"{secrets.randbelow(1000000):06d}"
    await db.password_resets.delete_many({"phone": phone})
    await db.password_resets.insert_one({
        "phone": phone, "code": code, "name": user["name"], "used": False,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    settings = await db.settings.find_one({"key": "store"}, {"_id": 0})
    msg = f"Olá! Esqueci minha senha do site Santa Fé. Meu telefone: {phone}. Pode me enviar o código de recuperação?"
    return {"whatsapp_url": f"https://wa.me/{settings['whatsapp_number']}?text={urllib.parse.quote(msg)}"}


@api_router.post("/auth/reset")
async def reset_password(body: ResetInput):
    phone = re.sub(r"\D", "", body.phone)
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter no mínimo 6 caracteres")
    reset = await db.password_resets.find_one({"phone": phone, "code": body.code.strip(), "used": False})
    if not reset or datetime.fromisoformat(reset["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Código inválido ou expirado. Solicite um novo.")
    await db.users.update_one({"phone": phone, "auth_type": "phone"}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await db.password_resets.update_one({"phone": phone, "code": body.code.strip()}, {"$set": {"used": True}})
    await db.login_attempts.delete_many({"identifier": phone})
    return {"ok": True}


@api_router.post("/auth/change-password")
async def change_password(body: ChangePasswordInput, request: Request):
    user_session = await get_current_user(request)
    if not user_session:
        raise HTTPException(status_code=401, detail="Não autenticado")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter no mínimo 6 caracteres")
    user = await db.users.find_one({"user_id": user_session["user_id"]})
    if user.get("auth_type") != "phone" or not user.get("password_hash"):
        raise HTTPException(status_code=400, detail="Sua conta usa login Google e não tem senha")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


@api_router.get("/admin/password-resets")
async def admin_password_resets(admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    return await db.password_resets.find({"used": False, "expires_at": {"$gte": now}}, {"_id": 0}).sort("created_at", -1).to_list(100)


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
    update = {"business_status": body.status}
    if body.status == "aprovado":
        update["referral_unlocked"] = True
    result = await db.users.update_one({"user_id": user_id, "account_type": "comercio"}, {"$set": update})
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


# ---------- Roleta removida (a pedido do usuário) ----------


# ---------- Cron: prêmio mensal do ranking ----------
async def award_monthly_bonus():
    now = datetime.now(timezone.utc)
    first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = first_this.isoformat()
    prev_month_start = (first_this - timedelta(days=1)).replace(day=1).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": prev_month_start, "$lt": prev_month_end}}},
        {"$group": {"_id": "$user_id", "indications": {"$sum": 1}}},
        {"$sort": {"indications": -1}},
        {"$limit": 1},
    ]
    rows = await db.referral_events.aggregate(pipeline).to_list(1)
    if not rows:
        return
    winner_id = rows[0]["_id"]
    settings = await db.settings.find_one({"key": "store"}, {"_id": 0})
    bonus = float(settings.get("ranking_bonus_value", 10.0))
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"user_id": winner_id}, {"$inc": {"referral_credit": bonus}})
    await db.credit_ledger.insert_one({
        "id": str(uuid.uuid4()), "user_id": winner_id, "type": "ganho", "amount": bonus,
        "description": "🏆 Prêmio: nº 1 do ranking de indicações do mês", "created_at": now_iso,
    })
    await db.referral_events.insert_one({
        "id": str(uuid.uuid4()), "user_id": winner_id, "amount": bonus,
        "from_name": "Prêmio do ranking mensal", "seen": False, "created_at": now_iso,
    })


@api_router.post("/cron/ranking-bonus")
async def cron_ranking_bonus(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    run_id = request.headers.get("X-Webhook-Id", "") or str(uuid.uuid4())
    existing = await db.cron_runs.find_one({"run_id": run_id})
    if existing:
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "job": "ranking-bonus", "at": datetime.now(timezone.utc).isoformat()})
    background_tasks.add_task(award_monthly_bonus)
    return {"ok": True}


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
            "loyalty_discount_value": 10.0,
            "referral_credit_value": 5.0,
            "ranking_bonus_value": 10.0,
            "promo_title": "Em breve, ofertas especiais da Santa Fé.",
            "promo_text": "Vamos usar este espaço para destacar as melhores ofertas e facilitar ainda mais seus pedidos.",
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
