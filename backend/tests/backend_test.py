"""Santa Fe backend tests - products, settings, orders, auth, loyalty, admin."""
import os
import uuid
import time
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://santafe-deposito.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


@pytest.fixture(scope="session")
def customer_session():
    """Create a customer user + session directly in MongoDB."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    token = f"test_session_{uuid.uuid4().hex}"
    db.users.insert_one({
        "user_id": user_id,
        "email": f"test.customer.{user_id}@example.com",
        "name": "Test Customer",
        "picture": None,
        "role": "customer",
        "phone": None,
        "saved_address": None,
        "order_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": user_id, "token": token}
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_one({"session_token": token})
    db.orders.delete_many({"user_id": user_id})


@pytest.fixture(scope="session")
def admin_session():
    user_id = f"test-admin-{uuid.uuid4().hex[:8]}"
    token = f"test_admin_session_{uuid.uuid4().hex}"
    db.users.insert_one({
        "user_id": user_id,
        "email": f"test.admin.{user_id}@example.com",
        "name": "Test Admin",
        "role": "admin",
        "order_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
    })
    yield {"user_id": user_id, "token": token}
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_one({"session_token": token})


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Products ----------
class TestProducts:
    def test_list_products_seeded(self):
        r = requests.get(f"{API}/products")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 2
        names = [p["name"] for p in data]
        assert any("P13" in n or "Botij" in n for n in names)
        assert any("gua" in n or "20L" in n for n in names)
        # verify prices
        for p in data:
            if ("P13" in p["name"] or "Botij" in p["name"]) and "Povo" not in p["name"]:
                assert p["price"] == 120.0
            if "20L" in p["name"]:
                assert p["price"] == 12.0


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self):
        r = requests.get(f"{API}/settings")
        assert r.status_code == 200
        d = r.json()
        assert d["whatsapp_number"] == "5583999999999"
        assert "hours_weekday_open" in d
        assert isinstance(d["store_open"], bool)


# ---------- Orders (guest) ----------
class TestOrdersGuest:
    def test_create_order_joao_pessoa(self):
        products = requests.get(f"{API}/products").json()
        p = products[0]
        body = {
            "customer_name": "TEST Cliente",
            "phone": "83999999999",
            "items": [{"product_id": p["id"], "name": p["name"], "price": p["price"], "qty": 2}],
            "payment_method": "Dinheiro",
            "address": {"cep": "58038101", "street": "Rua X", "number": "10",
                        "complement": "", "neighborhood": "Centro", "city": "João Pessoa"},
            "note": "teste"
        }
        r = requests.post(f"{API}/orders", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "whatsapp_url" in d
        assert d["whatsapp_url"].startswith("https://wa.me/5583999999999")
        assert "text=" in d["whatsapp_url"]
        assert d["phone_fallback"] == "tel:+5583999999999"
        assert d["order"]["total"] == p["price"] * 2

    def test_reject_outside_joao_pessoa(self):
        products = requests.get(f"{API}/products").json()
        p = products[0]
        body = {
            "customer_name": "TEST Recife",
            "phone": "81999999999",
            "items": [{"product_id": p["id"], "name": p["name"], "price": p["price"], "qty": 1}],
            "payment_method": "Dinheiro",
            "address": {"cep": "50030230", "street": "R", "number": "1", "city": "Recife"},
        }
        r = requests.post(f"{API}/orders", json=body)
        assert r.status_code == 400
        assert "João Pessoa" in r.json().get("detail", "")

    def test_accept_case_insensitive_city(self):
        products = requests.get(f"{API}/products").json()
        p = products[0]
        body = {
            "customer_name": "TEST", "phone": "83999",
            "items": [{"product_id": p["id"], "name": p["name"], "price": p["price"], "qty": 1}],
            "payment_method": "Pix",
            "address": {"cep": "58000000", "street": "R", "number": "1", "city": "joao pessoa"},
        }
        r = requests.post(f"{API}/orders", json=body)
        assert r.status_code == 200


# ---------- Auth ----------
class TestAuth:
    def test_auth_me(self, customer_session):
        r = requests.get(f"{API}/auth/me", headers=auth_headers(customer_session["token"]))
        assert r.status_code == 200
        assert r.json()["user_id"] == customer_session["user_id"]

    def test_auth_me_unauthorized(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_orders_my_empty(self, customer_session):
        r = requests.get(f"{API}/orders/my", headers=auth_headers(customer_session["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_loyalty_me(self, customer_session):
        r = requests.get(f"{API}/loyalty/me", headers=auth_headers(customer_session["token"]))
        assert r.status_code == 200
        d = r.json()
        assert "order_count" in d
        assert "remaining" in d


# ---------- Loyalty ----------
class TestLoyalty:
    def test_third_order_yields_loyalty_coupon(self, customer_session):
        # set order_count to 2 → next order = 3rd → new_count%4==3 → FIEL coupon generated
        db.users.update_one({"user_id": customer_session["user_id"]}, {"$set": {"order_count": 2}})
        products = requests.get(f"{API}/products").json()
        p = next(pr for pr in products if "Povo" not in pr["name"])  # non-GDP
        body = {
            "customer_name": "TEST Loyal", "phone": "83988",
            "items": [{"product_id": p["id"], "name": p["name"], "price": p["price"], "qty": 1}],
            "payment_method": "Dinheiro",
            "address": {"cep": "58038101", "street": "R", "number": "1", "city": "João Pessoa"},
        }
        r = requests.post(f"{API}/orders", json=body, headers=auth_headers(customer_session["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("loyalty_coupon") is not None
        assert d["loyalty_coupon"]["code"].startswith("FIEL")
        assert d["loyalty_coupon"]["value"] == 10

    def test_order_count_increments(self, customer_session):
        u = db.users.find_one({"user_id": customer_session["user_id"]})
        assert u["order_count"] >= 3


# ---------- Admin ----------
class TestAdmin:
    def test_non_admin_forbidden(self, customer_session):
        r = requests.get(f"{API}/admin/orders", headers=auth_headers(customer_session["token"]))
        assert r.status_code == 403

    def test_admin_orders(self, admin_session):
        r = requests.get(f"{API}/admin/orders", headers=auth_headers(admin_session["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_clients(self, admin_session):
        r = requests.get(f"{API}/admin/clients", headers=auth_headers(admin_session["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_products_crud(self, admin_session):
        h = auth_headers(admin_session["token"])
        # create
        r = requests.post(f"{API}/admin/products", json={"name": "TEST_PROD", "price": 5.5, "image_url": "", "active": True}, headers=h)
        assert r.status_code == 200
        pid = r.json()["id"]
        # list admin
        r = requests.get(f"{API}/admin/products", headers=h)
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())
        # update
        r = requests.put(f"{API}/admin/products/{pid}",
                         json={"name": "TEST_PROD_UPD", "price": 9.9, "image_url": "", "active": True}, headers=h)
        assert r.status_code == 200
        assert r.json()["price"] == 9.9
        # delete
        r = requests.delete(f"{API}/admin/products/{pid}", headers=h)
        assert r.status_code == 200

    def test_admin_settings_update(self, admin_session):
        h = auth_headers(admin_session["token"])
        original = requests.get(f"{API}/settings").json()
        body = {
            "whatsapp_number": "5583999999999",
            "hours_weekday_open": "07:00",
            "hours_weekday_close": "18:00",
            "hours_sunday_open": "07:00",
            "hours_sunday_close": "12:00",
            "loyalty_discount_percent": 10.0,
        }
        r = requests.put(f"{API}/admin/settings", json=body, headers=h)
        assert r.status_code == 200
        assert r.json()["whatsapp_number"] == "5583999999999"
