"""Iteration 4 revalidation: WhatsApp message cleanup.
   (a) No U+FFFD replacement char in message (emoji removed on GDP header line)
   (b) No legacy '6º pedido' text
   (c) Order flow still works for both GDP (logged-in) and P13 (guest)
"""
import os
import asyncio
import pytest
import requests
from urllib.parse import unquote
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
    return asyncio.new_event_loop().run_until_complete(coro)


async def _reset_test_user():
    db = _mongo()
    await db.users.update_one(
        {"phone": TEST_PHONE, "auth_type": "phone"},
        {"$set": {"order_count": 0}, "$unset": {"gdp_first_used": ""}},
    )


async def _cleanup(user_id):
    db = _mongo()
    await db.orders.delete_many({"user_id": user_id})
    await db.coupons.delete_many({"owner_user_id": user_id})
    await db.credit_ledger.delete_many({"user_id": user_id})
    # also cleanup guest test order
    await db.orders.delete_many({"customer_name": "TEST_Guest_P13"})


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
    pytest.skip(f"Cannot login: {last_err}")


@pytest.fixture(scope="module")
def user_id(session):
    return session.get(f"{BASE_URL}/api/auth/me", timeout=15).json()["user_id"]


@pytest.fixture(scope="module", autouse=True)
def _setup_teardown(user_id):
    _run(_reset_test_user())
    _run(_cleanup(user_id))
    yield
    _run(_reset_test_user())
    _run(_cleanup(user_id))


def test_gdp_order_logged_in_message_clean(session, user_id):
    """GDP order: msg contains GDP header WITHOUT U+FFFD and WITHOUT '6º pedido'."""
    _run(_reset_test_user())
    _run(_cleanup(user_id))
    payload = {
        "customer_name": "Maria Teste", "phone": TEST_PHONE,
        "items": [{"product_id": "gdp", "name": "Gás do Povo", "price": 20.0, "qty": 1}],
        "payment_method": "PIX", "address": ADDR, "cpf": "12345678901",
    }
    r = session.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()

    # Auto coupon on first GDP purchase
    assert body.get("auto_coupon") == "GASDOPOVO10"
    assert body["order"]["coupon_discount"] == 10.0
    assert body["order"]["total"] == 10.0
    assert body["order"]["cpf"] == "12345678901"

    # Decode whatsapp URL
    wa = body["whatsapp_url"]
    assert wa.startswith("https://wa.me/"), wa
    msg = unquote(wa.split("?text=", 1)[1])
    print("---GDP MSG---\n" + msg + "\n---END---")

    # Header: exact expected line, no U+FFFD, no '6º pedido'
    assert "PEDIDO GÁS DO POVO — verificar benefício/CPF do cliente" in msg
    assert "\ufffd" not in msg, f"Replacement char present! msg={msg!r}"
    assert "6º pedido" not in msg
    assert "6o pedido" not in msg.lower()

    # CPF & coupon present, total correct
    assert "12345678901" in msg
    assert "GASDOPOVO10" in msg
    assert "R$ 10,00" in msg


def test_p13_guest_order_message_clean():
    """Guest P13 order: normal message, no U+FFFD anywhere."""
    payload = {
        "customer_name": "TEST_Guest_P13", "phone": "83900000000",
        "items": [{"product_id": "p13", "name": "Gás P13 Supergasbras", "price": 120.0, "qty": 1}],
        "payment_method": "Dinheiro", "address": ADDR, "note": "TEST_regression",
    }
    r = requests.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    order = body["order"]
    assert order["total"] == 120.0
    assert order.get("is_gas_do_povo") == False

    wa = body["whatsapp_url"]
    msg = unquote(wa.split("?text=", 1)[1])
    print("---P13 MSG---\n" + msg + "\n---END---")

    assert "\ufffd" not in msg, f"Replacement char present! msg={msg!r}"
    assert "6º pedido" not in msg
    # GDP header should NOT appear for a P13 order
    assert "PEDIDO GÁS DO POVO" not in msg
    assert "NOVO PEDIDO - Santa Fé Distribuidora" in msg
    assert "R$ 120,00" in msg
