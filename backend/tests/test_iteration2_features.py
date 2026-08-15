"""Iteration 2: auth phone, referral, coupons, businesses, credit, upload."""
import os
import io
import uuid
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


def rand_phone():
    return "839" + str(uuid.uuid4().int)[:8]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def products():
    return requests.get(f"{API}/products").json()


@pytest.fixture(scope="session")
def p13(products):
    for p in products:
        if "P13" in p["name"]:
            return p
    pytest.skip("P13 product not present")


@pytest.fixture(scope="session")
def water(products):
    for p in products:
        if "gua" in p["name"] or "20L" in p["name"]:
            return p
    return products[0]


@pytest.fixture(scope="session")
def admin_session():
    user_id = f"test-admin-{uuid.uuid4().hex[:8]}"
    token = f"test_admin_{uuid.uuid4().hex}"
    db.users.insert_one({
        "user_id": user_id, "email": f"admin.{user_id}@t.com", "name": "Admin",
        "role": "admin", "order_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
    })
    yield {"user_id": user_id, "token": token}
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_one({"session_token": token})


# ---------- REGISTER / LOGIN ----------
class TestAuthPhone:
    def test_register_cliente_creates_referral_code_and_session(self):
        phone = rand_phone()
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={
            "name": "TEST Cliente", "phone": phone, "password": "teste123",
            "account_type": "cliente",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["phone"] == phone
        assert d["referral_code"].startswith("SF")
        assert d["referral_unlocked"] is False
        assert d["referral_credit"] == 0.0
        assert d["role"] == "customer"
        # cookie set
        assert "session_token" in s.cookies
        # /auth/me works via cookie
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["phone"] == phone
        # cleanup
        db.users.delete_one({"phone": phone})
        db.user_sessions.delete_many({"user_id": d["user_id"]})

    def test_register_duplicate_phone_400(self):
        phone = rand_phone()
        r = requests.post(f"{API}/auth/register", json={
            "name": "A", "phone": phone, "password": "teste123"})
        assert r.status_code == 200
        uid = r.json()["user_id"]
        r2 = requests.post(f"{API}/auth/register", json={
            "name": "B", "phone": phone, "password": "outrasenha"})
        assert r2.status_code == 400
        assert "cadastrado" in r2.json()["detail"].lower()
        db.users.delete_one({"user_id": uid})
        db.user_sessions.delete_many({"user_id": uid})

    def test_register_comercio_pending(self):
        phone = rand_phone()
        r = requests.post(f"{API}/auth/register", json={
            "name": "Dono", "phone": phone, "password": "teste123",
            "account_type": "comercio",
            "business_name": "TEST Mercadinho X",
            "business_address": "Av Teste 100",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["account_type"] == "comercio"
        assert d["business_status"] == "pendente"
        assert d["business_name"] == "TEST Mercadinho X"
        db.users.delete_one({"user_id": d["user_id"]})
        db.user_sessions.delete_many({"user_id": d["user_id"]})

    def test_login_ok_and_wrong_password(self):
        phone = rand_phone()
        r = requests.post(f"{API}/auth/register", json={
            "name": "L", "phone": phone, "password": "senha123"})
        uid = r.json()["user_id"]
        try:
            ok = requests.post(f"{API}/auth/login", json={"phone": phone, "password": "senha123"})
            assert ok.status_code == 200
            assert ok.json()["user_id"] == uid
            bad = requests.post(f"{API}/auth/login", json={"phone": phone, "password": "wrong"})
            assert bad.status_code == 401
        finally:
            db.users.delete_one({"user_id": uid})
            db.user_sessions.delete_many({"user_id": uid})
            db.login_attempts.delete_many({})

    def test_brute_force_lockout_behavior(self):
        """Brute-force lockout: 6 consecutive wrong attempts from same pod IP triggers 429.
        NOTE: Behind K8s ingress with multiple pod replicas, request.client.host varies per
        request (different pod IPs), causing attempts to be split across identifiers and
        the 429 may not trigger reliably. This test uses a session to keep TCP connection
        for a better chance of hitting the same pod, but flaky-tolerant.
        """
        phone = rand_phone()
        r = requests.post(f"{API}/auth/register", json={
            "name": "L", "phone": phone, "password": "senha123"})
        uid = r.json()["user_id"]
        try:
            s = requests.Session()
            codes = []
            for i in range(7):
                bad = s.post(f"{API}/auth/login", json={"phone": phone, "password": "wrong"})
                codes.append(bad.status_code)
            # At least one 429 should occur if brute force works and pods stick
            assert any(c == 429 for c in codes), f"No 429 in {codes} — brute-force lockout not triggered (see bug: uses request.client.host which varies across ingress replicas)"
        finally:
            db.users.delete_one({"user_id": uid})
            db.user_sessions.delete_many({"user_id": uid})
            db.login_attempts.delete_many({})


# ---------- COUPONS ----------
class TestCoupons:
    def test_admin_coupon_crud_and_validate(self, admin_session):
        h = auth_headers(admin_session["token"])
        code = f"TEST{uuid.uuid4().hex[:6].upper()}"
        # create
        r = requests.post(f"{API}/admin/coupons", json={
            "code": code, "type": "fixed", "value": 10.0,
            "first_purchase_only": False, "active": True}, headers=h)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["code"] == code
        # list
        lst = requests.get(f"{API}/admin/coupons", headers=h).json()
        assert any(c["id"] == cid for c in lst)
        # validate public - active OK
        v = requests.post(f"{API}/coupons/validate", json={"code": code})
        assert v.status_code == 200
        assert v.json()["code"] == code
        # validate bogus - 400
        vb = requests.post(f"{API}/coupons/validate", json={"code": "BOGUSXX"})
        assert vb.status_code == 400
        # update -> inactive
        up = requests.put(f"{API}/admin/coupons/{cid}", json={
            "code": code, "type": "fixed", "value": 10.0,
            "first_purchase_only": False, "active": False}, headers=h)
        assert up.status_code == 200
        # inactive -> validate 400
        v2 = requests.post(f"{API}/coupons/validate", json={"code": code})
        assert v2.status_code == 400
        # delete
        d = requests.delete(f"{API}/admin/coupons/{cid}", headers=h)
        assert d.status_code == 200

    def test_first_purchase_only_requires_login(self, admin_session):
        h = auth_headers(admin_session["token"])
        code = f"FIRST{uuid.uuid4().hex[:5].upper()}"
        cr = requests.post(f"{API}/admin/coupons", json={
            "code": code, "type": "percent", "value": 10.0,
            "first_purchase_only": True, "active": True}, headers=h)
        cid = cr.json()["id"]
        try:
            # guest → 400
            r = requests.post(f"{API}/coupons/validate", json={"code": code})
            assert r.status_code == 400
            assert "login" in r.json()["detail"].lower() or "primeira" in r.json()["detail"].lower()
        finally:
            requests.delete(f"{API}/admin/coupons/{cid}", headers=h)


# ---------- ORDER FLOWS (coupon, credit, referral, business) ----------
def _register_user(name="U", phone=None, account_type="cliente", business_name="", business_address=""):
    phone = phone or rand_phone()
    r = requests.post(f"{API}/auth/register", json={
        "name": name, "phone": phone, "password": "senha123",
        "account_type": account_type,
        "business_name": business_name, "business_address": business_address,
    })
    assert r.status_code == 200, r.text
    d = r.json()
    # session tokens: fetch via mongo (cookies not exposed to Bearer). Reuse via sessions collection.
    sess = list(db.user_sessions.find({"user_id": d["user_id"]}).sort("created_at", -1).limit(1))
    token = sess[0]["session_token"] if sess else None
    return d, token


def _cleanup_user(uid):
    db.users.delete_one({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})
    db.orders.delete_many({"user_id": uid})


class TestOrderFeatures:
    def test_p13_purchase_unlocks_referral(self, p13):
        u, tok = _register_user("TEST Ref")
        try:
            body = {
                "customer_name": u["name"], "phone": u["phone"],
                "items": [{"product_id": p13["id"], "name": p13["name"], "price": p13["price"], "qty": 1}],
                "payment_method": "PIX",
                "address": {"cep": "58038100", "street": "R", "number": "1",
                            "neighborhood": "Centro", "city": "João Pessoa"},
            }
            r = requests.post(f"{API}/orders", json=body, headers=auth_headers(tok))
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["referral_unlocked_now"] is True
            # user now has referral_unlocked True
            udb = db.users.find_one({"user_id": u["user_id"]})
            assert udb["referral_unlocked"] is True
        finally:
            _cleanup_user(u["user_id"])

    def test_referral_credits_indicator_and_blocks_self_ref(self, p13):
        # A = indicator, B = referred buyer
        a, atok = _register_user("TEST Ind")
        b, btok = _register_user("TEST Buy")
        try:
            # unlock A by making 1 P13 purchase
            body = {"customer_name": "A", "phone": a["phone"],
                    "items": [{"product_id": p13["id"], "name": p13["name"], "price": p13["price"], "qty": 1}],
                    "payment_method": "PIX",
                    "address": {"cep": "58038100", "street": "R", "number": "1",
                                "neighborhood": "C", "city": "João Pessoa"}}
            r0 = requests.post(f"{API}/orders", json=body, headers=auth_headers(atok))
            assert r0.status_code == 200
            a_code = db.users.find_one({"user_id": a["user_id"]})["referral_code"]

            # Self-referral by A → no credit
            body_self = {**body, "referral_code": a_code, "phone": a["phone"]}
            requests.post(f"{API}/orders", json=body_self, headers=auth_headers(atok))
            a_after_self = db.users.find_one({"user_id": a["user_id"]})
            assert float(a_after_self.get("referral_credit", 0)) == 0.0, "self-ref must not credit"

            # B buys P13 with A's referral → A gets +5
            body_b = {"customer_name": "B", "phone": b["phone"],
                      "items": [{"product_id": p13["id"], "name": p13["name"], "price": p13["price"], "qty": 1}],
                      "payment_method": "PIX",
                      "address": {"cep": "58038100", "street": "R", "number": "2",
                                  "neighborhood": "C", "city": "João Pessoa"},
                      "referral_code": a_code}
            rb = requests.post(f"{API}/orders", json=body_b, headers=auth_headers(btok))
            assert rb.status_code == 200
            assert rb.json()["order"]["referred_by_code"] == a_code
            a_final = db.users.find_one({"user_id": a["user_id"]})
            assert float(a_final.get("referral_credit", 0)) == 5.0
        finally:
            _cleanup_user(a["user_id"])
            _cleanup_user(b["user_id"])

    def test_order_with_coupon_fixed_and_use_credit(self, p13, admin_session):
        h = auth_headers(admin_session["token"])
        code = f"OFF{uuid.uuid4().hex[:5].upper()}"
        cr = requests.post(f"{API}/admin/coupons", json={
            "code": code, "type": "fixed", "value": 10.0,
            "first_purchase_only": False, "active": True}, headers=h).json()
        u, tok = _register_user("TEST CredCoup")
        # give user 5 credit and mark referral_unlocked to allow credit_used path
        db.users.update_one({"user_id": u["user_id"]}, {"$set": {"referral_credit": 5.0}})
        try:
            body = {"customer_name": "U", "phone": u["phone"],
                    "items": [{"product_id": p13["id"], "name": p13["name"], "price": p13["price"], "qty": 1}],
                    "payment_method": "PIX",
                    "address": {"cep": "58038100", "street": "R", "number": "1",
                                "neighborhood": "C", "city": "João Pessoa"},
                    "coupon_code": code, "use_credit": True}
            r = requests.post(f"{API}/orders", json=body, headers=auth_headers(tok))
            assert r.status_code == 200, r.text
            o = r.json()["order"]
            # subtotal = p13 price; total = subtotal - 10 (coupon) - 5 (credit)
            expected = p13["price"] - 10 - 5
            assert o["coupon_discount"] == 10.0
            assert o["credit_used"] == 5.0
            assert o["total"] == expected
            import urllib.parse
            msg = urllib.parse.unquote(r.json()["whatsapp_url"])
            assert code in msg
            assert "Cupom" in msg
            # user credit decremented
            u_after = db.users.find_one({"user_id": u["user_id"]})
            assert float(u_after.get("referral_credit", 0)) == 0.0
        finally:
            requests.delete(f"{API}/admin/coupons/{cr['id']}", headers=h)
            _cleanup_user(u["user_id"])

    def test_business_order_is_price_negotiable(self, p13):
        phone = rand_phone()
        r = requests.post(f"{API}/auth/register", json={
            "name": "Dono", "phone": phone, "password": "senha123",
            "account_type": "comercio", "business_name": "TEST Biz",
            "business_address": "Av Teste 1"})
        assert r.status_code == 200
        uid = r.json()["user_id"]
        sess = list(db.user_sessions.find({"user_id": uid}).sort("created_at", -1).limit(1))
        tok = sess[0]["session_token"]
        try:
            body = {"customer_name": "Dono", "phone": phone,
                    "items": [{"product_id": p13["id"], "name": p13["name"], "price": p13["price"], "qty": 5}],
                    "payment_method": "PIX",
                    "address": {"cep": "58038100", "street": "R", "number": "1",
                                "neighborhood": "C", "city": "João Pessoa"}}
            resp = requests.post(f"{API}/orders", json=body, headers=auth_headers(tok))
            assert resp.status_code == 200, resp.text
            o = resp.json()["order"]
            assert o["total"] == 0.0
            assert o["price_negotiable"] is True
            import urllib.parse
            msg = urllib.parse.unquote(resp.json()["whatsapp_url"])
            assert "combinar" in msg.lower()
        finally:
            _cleanup_user(uid)


# ---------- Referral endpoints ----------
class TestReferralEndpoints:
    def test_referral_me_and_qr(self):
        u, tok = _register_user("TEST QR")
        try:
            r = requests.get(f"{API}/referral/me", headers=auth_headers(tok))
            assert r.status_code == 200
            d = r.json()
            assert d["unlocked"] is False
            assert d["code"].startswith("SF")
            assert d["credit"] == 0.0
            assert d["credit_value"] == 5.0
            qr = requests.get(f"{API}/referral/qr", params={"link": "https://example.com/?ref=X"},
                              headers=auth_headers(tok))
            assert qr.status_code == 200
            assert qr.headers["content-type"] == "image/png"
            assert len(qr.content) > 100
        finally:
            _cleanup_user(u["user_id"])


# ---------- Businesses ----------
class TestBusinesses:
    def test_business_appears_only_after_approval(self, admin_session):
        h = auth_headers(admin_session["token"])
        phone = rand_phone()
        r = requests.post(f"{API}/auth/register", json={
            "name": "Dono", "phone": phone, "password": "senha123",
            "account_type": "comercio",
            "business_name": f"TEST_BIZ_{uuid.uuid4().hex[:6]}",
            "business_address": "Rua Teste"})
        assert r.status_code == 200
        uid = r.json()["user_id"]
        bname = r.json()["business_name"]
        try:
            # not approved → not in public list
            lst = requests.get(f"{API}/businesses").json()
            assert not any(b["business_name"] == bname for b in lst)
            # admin approves
            ap = requests.put(f"{API}/admin/businesses/{uid}/status",
                              json={"status": "aprovado"}, headers=h)
            assert ap.status_code == 200
            lst2 = requests.get(f"{API}/businesses").json()
            assert any(b["business_name"] == bname for b in lst2)
        finally:
            _cleanup_user(uid)


# ---------- Upload ----------
class TestUpload:
    def test_upload_facade_jpg_and_serve(self):
        # tiny valid JPEG generated in-memory
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (2, 2), color=(255, 0, 0)).save(buf, format="JPEG")
        buf.seek(0)
        files = {"file": ("test.jpg", buf, "image/jpeg")}
        r = requests.post(f"{API}/upload/facade", files=files)
        assert r.status_code == 200, r.text
        path = r.json()["path"]
        assert path
        s = requests.get(f"{API}/files/{path}")
        assert s.status_code == 200, s.text
        assert s.headers["content-type"].startswith("image/")
        assert len(s.content) > 0

    def test_upload_rejects_bad_mime(self):
        files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/upload/facade", files=files)
        assert r.status_code == 400
