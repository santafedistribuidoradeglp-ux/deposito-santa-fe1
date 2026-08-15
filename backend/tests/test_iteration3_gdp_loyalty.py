"""Iteration 3 tests: 4 produtos (sort_order), fidelidade 3/3, Gás do Povo auto-coupon, cupom scope gasdopovo, single_use loyalty coupon."""
import os
import re
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://santafe-deposito.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "test_database"

TEST_PHONE = "83911112222"
TEST_PASSWORDS = ["senha12345", "novasenha123", "teste123"]

ADDR = {"cep": "58035000", "street": "Rua Teste", "number": "10", "complement": "",
        "neighborhood": "Centro", "city": "João Pessoa"}


def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.new_event_loop().run_until_complete(coro)


async def _reset_user(order_count=0, gdp_first_used=False, referral_credit=None):
    db = _mongo()
    upd = {"order_count": order_count}
    if referral_credit is not None:
        upd["referral_credit"] = referral_credit
    if gdp_first_used:
        upd["gdp_first_used"] = True
        u = {"$set": upd}
    else:
        u = {"$set": upd, "$unset": {"gdp_first_used": ""}}
    await db.users.update_one({"phone": TEST_PHONE, "auth_type": "phone"}, u)


async def _cleanup_test_orders_and_coupons(user_id):
    db = _mongo()
    await db.orders.delete_many({"user_id": user_id})
    await db.coupons.delete_many({"owner_user_id": user_id})
    await db.credit_ledger.delete_many({"user_id": user_id})
    await db.referral_events.delete_many({"user_id": user_id})


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    last_err = None
    for pwd in TEST_PASSWORDS:
        r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": TEST_PHONE, "password": pwd}, timeout=15)
        if r.status_code == 200:
            print(f"Logged in with password: {pwd}")
            return s
        last_err = r.text
    pytest.skip(f"Cannot login test user 83911112222: {last_err}")


@pytest.fixture(scope="module")
def user_id(session):
    r = session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    return r.json()["user_id"]


@pytest.fixture(autouse=True)
def _cleanup_before(user_id):
    asyncio.new_event_loop().run_until_complete(_cleanup_test_orders_and_coupons(user_id))
    yield


# --------- 1. GET /api/products: 4 products in sort_order ---------
def test_products_order_and_gdp():
    r = requests.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    prods = r.json()
    names = [p["name"] for p in prods]
    print("Product order:", names)
    assert len(prods) == 4, f"Expected 4 products, got {len(prods)}: {names}"
    assert "P13" in prods[0]["name"] or "p13" in prods[0]["name"].lower()
    assert prods[1]["name"] == "Gás do Povo"
    assert prods[1]["price"] == 20.0
    assert "Itacoatiara" in prods[2]["name"]
    assert "Sublime" in prods[3]["name"]


# --------- 2. Fidelidade: order_count=2 → 3º pedido gera cupom FIEL ---------
def test_loyalty_coupon_generated_on_third_order(session, user_id):
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=2))
    # loyalty/me should show progress 2, remaining 1
    r = session.get(f"{BASE_URL}/api/loyalty/me", timeout=15)
    data = r.json()
    assert data["cycle_size"] == 3
    assert data["cycle_progress"] == 2
    assert data["remaining"] == 1

    payload = {
        "customer_name": "Maria Teste", "phone": TEST_PHONE,
        "items": [{"product_id": "p13", "name": "Gás P13 Supergasbras", "price": 120.0, "qty": 1}],
        "payment_method": "PIX", "address": ADDR, "note": "TEST",
    }
    r = session.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    lc = body.get("loyalty_coupon")
    assert lc is not None, f"loyalty_coupon expected, got: {body}"
    assert lc["code"].startswith("FIEL")
    assert lc["value"] == 10.0

    # verify coupon in db
    async def _fetch():
        return await _mongo().coupons.find_one({"code": lc["code"]}, {"_id": 0})
    coupon = asyncio.new_event_loop().run_until_complete(_fetch())
    assert coupon["owner_user_id"] == user_id
    assert coupon["single_use"] is True
    assert coupon["type"] == "fixed"


# --------- 3. Fidelidade: order_count=3 (resgate) → NÃO gera cupom ---------
def test_no_loyalty_coupon_on_redemption_order(session):
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=3))
    payload = {
        "customer_name": "Maria Teste", "phone": TEST_PHONE,
        "items": [{"product_id": "p13", "name": "Gás P13 Supergasbras", "price": 120.0, "qty": 1}],
        "payment_method": "PIX", "address": ADDR,
    }
    r = session.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 200
    assert r.json().get("loyalty_coupon") is None


# --------- 4. Gás do Povo auto-coupon on first purchase ---------
def test_gdp_auto_coupon_first_purchase(session, user_id):
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=0, gdp_first_used=False))
    payload = {
        "customer_name": "Maria Teste", "phone": TEST_PHONE,
        "items": [{"product_id": "gdp", "name": "Gás do Povo", "price": 20.0, "qty": 1}],
        "payment_method": "PIX", "address": ADDR, "cpf": "12345678901",
    }
    r = session.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    order = body["order"]
    assert body.get("auto_coupon") == "GASDOPOVO10"
    assert order["coupon_code"] == "GASDOPOVO10"
    assert order["coupon_discount"] == 10.0
    assert order["total"] == 10.0
    assert order["cpf"] == "12345678901"
    assert order.get("is_gas_do_povo") is True
    wa = body["whatsapp_url"]
    from urllib.parse import unquote
    msg = unquote(wa)
    assert "GÁS DO POVO" in msg or "GAS DO POVO" in msg.upper()
    assert "12345678901" in msg


# --------- 5. Gás do Povo second time: no auto coupon ---------
def test_gdp_second_purchase_no_auto_coupon(session):
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=0, gdp_first_used=True))
    payload = {
        "customer_name": "Maria Teste", "phone": TEST_PHONE,
        "items": [{"product_id": "gdp", "name": "Gás do Povo", "price": 20.0, "qty": 1}],
        "payment_method": "PIX", "address": ADDR, "cpf": "12345678901",
    }
    r = session.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("auto_coupon") == ""
    assert body["order"]["coupon_discount"] == 0
    assert body["order"]["total"] == 20.0


# --------- 6. Coupon gasdopovo scope rejected without gdp item ---------
def test_gdp_scope_coupon_rejected_without_gdp_item(session):
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=0))
    payload = {
        "customer_name": "Maria Teste", "phone": TEST_PHONE,
        "items": [{"product_id": "p13", "name": "Gás P13 Supergasbras", "price": 120.0, "qty": 1}],
        "payment_method": "PIX", "address": ADDR,
        "coupon_code": "GASDOPOVO10",
    }
    r = session.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 400
    assert "Gás do Povo" in r.json().get("detail", "") or "gas do povo" in r.json().get("detail", "").lower()


# --------- 7. Fidelidade single_use: 2nd use rejected ---------
def test_loyalty_coupon_single_use(session, user_id):
    # Generate one
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=2))
    payload = {
        "customer_name": "Maria Teste", "phone": TEST_PHONE,
        "items": [{"product_id": "p13", "name": "Gás P13 Supergasbras", "price": 120.0, "qty": 1}],
        "payment_method": "PIX", "address": ADDR,
    }
    r = session.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 200
    lc = r.json().get("loyalty_coupon")
    assert lc, "loyalty coupon must be generated"
    code = lc["code"]

    # First redemption
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=3))
    payload2 = {**payload, "coupon_code": code}
    r2 = session.post(f"{BASE_URL}/api/orders", json=payload2, timeout=15)
    assert r2.status_code == 200, r2.text
    assert r2.json()["order"]["coupon_discount"] == 10.0

    # 2nd attempt: should be rejected (single_use + used)
    r3 = session.post(f"{BASE_URL}/api/orders", json=payload2, timeout=15)
    assert r3.status_code == 400
    assert "já foi utilizado" in r3.json().get("detail", "").lower() or "utilizado" in r3.json().get("detail", "").lower()


# --------- Restore user (teardown) ---------
def test_zzz_restore_user(user_id):
    asyncio.new_event_loop().run_until_complete(_reset_user(order_count=0, gdp_first_used=False, referral_credit=5.0))
    asyncio.new_event_loop().run_until_complete(_cleanup_test_orders_and_coupons(user_id))
    print("User restored")
