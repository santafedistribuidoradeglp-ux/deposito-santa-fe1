"""Referral unlock/share backend regression tests for immediate link and P13 credit flows."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL is required", allow_module_level=True)

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    pytest.skip("MONGO_URL and DB_NAME are required", allow_module_level=True)

API = f"{BASE_URL.rstrip('/')}/api"
mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


@pytest.fixture
def cleanup_registry():
    """Track and cleanup test-created records across users, sessions, orders, events and ledger."""
    registry = {
        "user_ids": set(),
        "phones": set(),
        "session_tokens": set(),
        "order_ids": set(),
    }
    yield registry

    if registry["order_ids"]:
        db.orders.delete_many({"id": {"$in": list(registry["order_ids"])}})

    if registry["user_ids"]:
        user_ids = list(registry["user_ids"])
        db.referral_events.delete_many({"user_id": {"$in": user_ids}})
        db.credit_ledger.delete_many({"user_id": {"$in": user_ids}})
        db.user_sessions.delete_many({"user_id": {"$in": user_ids}})
        db.orders.delete_many({"user_id": {"$in": user_ids}})
        db.users.delete_many({"user_id": {"$in": user_ids}})

    if registry["phones"]:
        db.users.delete_many({"phone": {"$in": list(registry["phones"])}})

    if registry["session_tokens"]:
        db.user_sessions.delete_many({"session_token": {"$in": list(registry["session_tokens"])}})


def _digits(length: int = 6) -> str:
    return str(uuid.uuid4().int % (10 ** length)).zfill(length)


def _register_customer(cleanup_registry, suffix: str):
    phone = f"83977{_digits(6)}"
    payload = {
        "name": f"TEST Referral {suffix}",
        "phone": phone,
        "password": "senha12345",
        "account_type": "cliente",
        "business_name": "",
        "business_address": "",
        "facade_path": "",
    }
    session = requests.Session()
    response = session.post(f"{API}/auth/register", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    cleanup_registry["user_ids"].add(data["user_id"])
    cleanup_registry["phones"].add(phone)
    return session, data


def _get_p13_product():
    products_response = requests.get(f"{API}/products")
    assert products_response.status_code == 200, products_response.text
    products = products_response.json()
    p13 = next((p for p in products if "p13" in p["name"].lower()), None)
    assert p13 is not None, "No P13 product found in seeded products"
    return p13


# Modules/features: auth register, referral me auto-unlock, order referral crediting and self-referral block
class TestReferralImmediateUnlockAndCredit:
    def test_register_unlocks_referral_and_referral_me_has_code(self, cleanup_registry):
        session, user = _register_customer(cleanup_registry, uuid.uuid4().hex[:5])

        assert user["auth_type"] == "phone"
        assert user["referral_unlocked"] is True
        assert isinstance(user.get("referral_code"), str)
        assert user["referral_code"].startswith("SF")

        referral_response = session.get(f"{API}/referral/me")
        assert referral_response.status_code == 200, referral_response.text
        referral_data = referral_response.json()

        assert referral_data["unlocked"] is True
        assert referral_data["code"] == user["referral_code"]
        assert isinstance(referral_data["credit"], float)
        assert referral_data["credit"] == 0.0
        assert isinstance(referral_data["credit_value"], float)

    def test_guest_p13_order_with_referral_credits_referrer(self, cleanup_registry):
        ref_session, ref_user = _register_customer(cleanup_registry, uuid.uuid4().hex[:5])
        referral_before = ref_session.get(f"{API}/referral/me")
        assert referral_before.status_code == 200
        referral_info = referral_before.json()

        p13 = _get_p13_product()
        order_payload = {
            "customer_name": "TEST Guest Buyer",
            "phone": "83999888777",
            "items": [{
                "product_id": p13["id"],
                "name": p13["name"],
                "price": p13["price"],
                "qty": 1,
            }],
            "payment_method": "Pix",
            "address": {
                "cep": "58038101",
                "street": "Rua Teste",
                "number": "10",
                "complement": "",
                "neighborhood": "Centro",
                "city": "João Pessoa",
            },
            "note": "",
            "coupon_code": "",
            "use_credit": False,
            "referral_code": referral_info["code"],
            "cpf": "",
        }
        order_response = requests.post(f"{API}/orders", json=order_payload)
        assert order_response.status_code == 200, order_response.text
        order_data = order_response.json()

        order_id = order_data["order"]["id"]
        cleanup_registry["order_ids"].add(order_id)
        assert order_data["order"]["referred_by_code"] == referral_info["code"]

        referral_after = ref_session.get(f"{API}/referral/me")
        assert referral_after.status_code == 200
        updated_info = referral_after.json()
        expected_credit = round(referral_info["credit"] + referral_info["credit_value"], 2)
        assert round(updated_info["credit"], 2) == expected_credit

        ledger_response = ref_session.get(f"{API}/referral/ledger")
        assert ledger_response.status_code == 200
        ledger = ledger_response.json()
        assert any(
            item["type"] == "ganho" and round(float(item["amount"]), 2) == round(referral_info["credit_value"], 2)
            for item in ledger
        )

    def test_self_referral_does_not_credit(self, cleanup_registry):
        own_session, own_user = _register_customer(cleanup_registry, uuid.uuid4().hex[:5])
        referral_response = own_session.get(f"{API}/referral/me")
        assert referral_response.status_code == 200
        referral_info = referral_response.json()

        p13 = _get_p13_product()
        order_payload = {
            "customer_name": own_user["name"],
            "phone": own_user["phone"],
            "items": [{
                "product_id": p13["id"],
                "name": p13["name"],
                "price": p13["price"],
                "qty": 1,
            }],
            "payment_method": "Dinheiro",
            "address": {
                "cep": "58038101",
                "street": "Rua Teste",
                "number": "12",
                "complement": "",
                "neighborhood": "Centro",
                "city": "João Pessoa",
            },
            "note": "",
            "coupon_code": "",
            "use_credit": False,
            "referral_code": referral_info["code"],
            "cpf": "",
        }
        order_response = own_session.post(f"{API}/orders", json=order_payload)
        assert order_response.status_code == 200, order_response.text
        order_data = order_response.json()
        cleanup_registry["order_ids"].add(order_data["order"]["id"])
        assert order_data["order"]["referred_by_code"] == ""

        after_referral = own_session.get(f"{API}/referral/me")
        assert after_referral.status_code == 200
        assert round(after_referral.json()["credit"], 2) == round(referral_info["credit"], 2)

    def test_referral_me_migrates_old_blocked_account(self, cleanup_registry):
        user_id = f"test-old-ref-{uuid.uuid4().hex[:8]}"
        phone = f"83966{_digits(6)}"
        token = f"test_session_{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc)

        db.users.insert_one({
            "user_id": user_id,
            "name": "TEST Legacy Referral",
            "phone": phone,
            "email": None,
            "picture": None,
            "password_hash": "$2b$12$2qWQ4xY2hVf80FZPG7kPz.6ICWn3DsFsP6xa1FvAQw2zJQxLi6WTK",
            "auth_type": "phone",
            "role": "customer",
            "account_type": "cliente",
            "referral_unlocked": False,
            "referral_credit": 0.0,
            "order_count": 0,
            "saved_address": None,
            "created_at": now.isoformat(),
        })
        db.user_sessions.insert_one({
            "user_id": user_id,
            "session_token": token,
            "expires_at": now + timedelta(days=1),
            "created_at": now.isoformat(),
        })

        cleanup_registry["user_ids"].add(user_id)
        cleanup_registry["phones"].add(phone)
        cleanup_registry["session_tokens"].add(token)

        response = requests.get(f"{API}/referral/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200, response.text
        data = response.json()

        assert data["unlocked"] is True
        assert isinstance(data["code"], str)
        assert data["code"].startswith("SF")

        persisted = db.users.find_one({"user_id": user_id}, {"_id": 0})
        assert persisted["referral_unlocked"] is True
        assert isinstance(persisted.get("referral_code"), str)
        assert persisted["referral_code"].startswith("SF")
