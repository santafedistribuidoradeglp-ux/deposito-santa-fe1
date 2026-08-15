import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Save, Check, X, Store, BarChart3, Trophy } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUSES = ["enviado", "em_entrega", "entregue", "cancelado"];
const STATUS_LABELS = { enviado: "Enviado", em_entrega: "Em entrega", entregue: "Entregue", cancelado: "Cancelado" };
const inputCls = "w-full h-12 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring";

const EMPTY_PRODUCT = { name: "", price: "", card_price: "", description: "", tag: "", visual: "", image_url: "", active: true };
const EMPTY_COUPON = { code: "", type: "fixed", value: "", first_purchase_only: false, active: true };

export default function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pform, setPform] = useState(EMPTY_PRODUCT);
  const [coupons, setCoupons] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [cform, setCform] = useState(EMPTY_COUPON);
  const [resets, setResets] = useState([]);
  const [report, setReport] = useState(null);
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) navigate("/");
  }, [loading, user, navigate]);

  const loadAll = useCallback(() => {
    const opts = { withCredentials: true };
    axios.get(`${API}/admin/products`, opts).then((r) => setProducts(r.data));
    axios.get(`${API}/admin/orders`, opts).then((r) => setOrders(r.data));
    axios.get(`${API}/admin/clients`, opts).then((r) => setClients(r.data));
    axios.get(`${API}/admin/coupons`, opts).then((r) => setCoupons(r.data));
    axios.get(`${API}/admin/businesses`, opts).then((r) => setBusinesses(r.data));
    axios.get(`${API}/admin/password-resets`, opts).then((r) => setResets(r.data));
    axios.get(`${API}/admin/report?days=7`, opts).then((r) => setReport(r.data));
    axios.get(`${API}/admin/referral-ranking`, opts).then((r) => setRanking(r.data));
    axios.get(`${API}/settings`).then((r) => setSettings(r.data));
  }, []);

  useEffect(() => {
    if (user?.role === "admin") loadAll();
  }, [user, loadAll]);

  const knownIds = useRef(null);
  useEffect(() => {
    if (user?.role !== "admin") return;
    const beep = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; gain.gain.value = 0.15;
        osc.start(); osc.stop(ctx.currentTime + 0.25);
      } catch {}
    };
    const poll = async () => {
      try {
        const r = await axios.get(`${API}/admin/orders`, { withCredentials: true });
        if (knownIds.current) {
          const news = r.data.filter((o) => !knownIds.current.has(o.id));
          if (news.length > 0) {
            toast.success(`🔔 ${news.length} novo${news.length > 1 ? "s" : ""} pedido${news.length > 1 ? "s" : ""} recebido${news.length > 1 ? "s" : ""}!`, { duration: 8000 });
            beep();
            setOrders(r.data);
          }
        }
        knownIds.current = new Set(r.data.map((o) => o.id));
      } catch {}
    };
    const interval = setInterval(poll, 20000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading || !user || user.role !== "admin") return null;

  const openNew = () => { setEditing(null); setPform(EMPTY_PRODUCT); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setPform({ name: p.name, price: p.price, card_price: p.card_price ?? "", description: p.description || "", tag: p.tag || "", visual: p.visual || "", image_url: p.image_url, active: p.active }); setDialogOpen(true); };

  const saveProduct = async () => {
    const body = { ...pform, price: parseFloat(pform.price), card_price: pform.card_price === "" ? null : parseFloat(pform.card_price) };
    if (!body.name || isNaN(body.price)) { toast.error("Preencha nome e preço"); return; }
    try {
      if (editing) {
        await axios.put(`${API}/admin/products/${editing.id}`, body, { withCredentials: true });
      } else {
        await axios.post(`${API}/admin/products`, body, { withCredentials: true });
      }
      toast.success("Produto salvo!");
      setDialogOpen(false);
      loadAll();
    } catch { toast.error("Erro ao salvar produto"); }
  };

  const deleteProduct = async (id) => {
    await axios.delete(`${API}/admin/products/${id}`, { withCredentials: true });
    toast.success("Produto removido");
    loadAll();
  };

  const setOrderStatus = async (id, status) => {
    await axios.put(`${API}/admin/orders/${id}/status`, { status }, { withCredentials: true });
    setOrders((os) => os.map((o) => (o.id === id ? { ...o, status } : o)));
    toast.success("Status atualizado");
  };

  const saveSettings = async () => {
    try {
      const r = await axios.put(`${API}/admin/settings`, {
        whatsapp_number: settings.whatsapp_number,
        hours_weekday_open: settings.hours_weekday_open,
        hours_weekday_close: settings.hours_weekday_close,
        hours_sunday_open: settings.hours_sunday_open,
        hours_sunday_close: settings.hours_sunday_close,
        loyalty_discount_percent: parseFloat(settings.loyalty_discount_percent) || 10,
        referral_credit_value: parseFloat(settings.referral_credit_value) || 5,
      }, { withCredentials: true });
      setSettings(r.data);
      toast.success("Configurações salvas!");
    } catch { toast.error("Erro ao salvar"); }
  };

  const openNewCoupon = () => { setEditingCoupon(null); setCform(EMPTY_COUPON); setCouponDialogOpen(true); };
  const openEditCoupon = (c) => { setEditingCoupon(c); setCform({ code: c.code, type: c.type, value: c.value, first_purchase_only: c.first_purchase_only, active: c.active }); setCouponDialogOpen(true); };

  const saveCoupon = async () => {
    const body = { ...cform, value: parseFloat(cform.value) };
    if (!body.code.trim() || isNaN(body.value)) { toast.error("Preencha código e valor"); return; }
    try {
      if (editingCoupon) {
        await axios.put(`${API}/admin/coupons/${editingCoupon.id}`, body, { withCredentials: true });
      } else {
        await axios.post(`${API}/admin/coupons`, body, { withCredentials: true });
      }
      toast.success("Cupom salvo!");
      setCouponDialogOpen(false);
      loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro ao salvar cupom"); }
  };

  const deleteCoupon = async (id) => {
    await axios.delete(`${API}/admin/coupons/${id}`, { withCredentials: true });
    toast.success("Cupom removido");
    loadAll();
  };

  const setBusinessStatus = async (userId, status) => {
    await axios.put(`${API}/admin/businesses/${userId}/status`, { status }, { withCredentials: true });
    setBusinesses((bs) => bs.map((b) => (b.user_id === userId ? { ...b, business_status: status } : b)));
    toast.success(status === "aprovado" ? "Comércio aprovado e publicado!" : "Status atualizado");
  };

  const sset = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="max-w-md mx-auto px-5 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight mt-6" style={{ fontFamily: "Manrope" }} data-testid="admin-title">Painel Admin</h1>

      <Tabs defaultValue="report" className="mt-5">
        <TabsList className="w-full rounded-full h-11 flex overflow-x-auto justify-start">
          <TabsTrigger value="report" className="rounded-full text-xs flex-1 min-w-fit px-3" data-testid="tab-report">Resumo</TabsTrigger>
          <TabsTrigger value="orders" className="rounded-full text-xs flex-1 min-w-fit px-3" data-testid="tab-orders">Pedidos</TabsTrigger>
          <TabsTrigger value="products" className="rounded-full text-xs flex-1 min-w-fit px-3" data-testid="tab-products">Produtos</TabsTrigger>
          <TabsTrigger value="coupons" className="rounded-full text-xs flex-1 min-w-fit px-3" data-testid="tab-coupons">Cupons</TabsTrigger>
          <TabsTrigger value="businesses" className="rounded-full text-xs flex-1 min-w-fit px-3" data-testid="tab-businesses">Comércios</TabsTrigger>
          <TabsTrigger value="clients" className="rounded-full text-xs flex-1 min-w-fit px-3" data-testid="tab-clients">Clientes</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-full text-xs flex-1 min-w-fit px-3" data-testid="tab-settings">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="mt-5 space-y-4">
          {report && (
            <>
              <p className="text-sm font-bold text-muted-foreground flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Últimos {report.days} dias</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-border p-4" data-testid="report-total-orders">
                  <p className="text-3xl font-extrabold text-primary" style={{ fontFamily: "Manrope" }}>{report.total_orders}</p>
                  <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Pedidos</p>
                </div>
                <div className="bg-white rounded-2xl border border-border p-4" data-testid="report-revenue">
                  <p className="text-2xl font-extrabold text-green-700" style={{ fontFamily: "Manrope" }}>{brl(report.total_revenue)}</p>
                  <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Faturamento{report.negotiable_orders > 0 ? ` (+${report.negotiable_orders} a combinar)` : ""}</p>
                </div>
                <div className="bg-white rounded-2xl border border-border p-4" data-testid="report-new-clients">
                  <p className="text-3xl font-extrabold text-secondary" style={{ fontFamily: "Manrope" }}>{report.new_clients}</p>
                  <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Novos clientes</p>
                </div>
                <div className="bg-white rounded-2xl border border-border p-4" data-testid="report-credits">
                  <p className="text-2xl font-extrabold text-foreground" style={{ fontFamily: "Manrope" }}>{brl(report.credits_given)}</p>
                  <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Créditos dados</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-border p-4" data-testid="report-top-products">
                <p className="font-bold text-sm mb-3">Produtos mais vendidos</p>
                {report.top_products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
                ) : (
                  <div className="space-y-2">
                    {report.top_products.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between text-sm" data-testid={`top-product-${i}`}>
                        <span className="font-semibold truncate">{i + 1}. {p.name}</span>
                        <span className="font-extrabold text-primary shrink-0 ml-2">{p.qty} un</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="bg-white rounded-2xl border border-border p-4" data-testid="referral-ranking-box">
            <p className="font-bold text-sm mb-3 flex items-center gap-1.5"><Trophy className="w-4 h-4 text-secondary" /> Ranking de indicadores</p>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="ranking-empty">Nenhuma indicação registrada ainda.</p>
            ) : (
              <div className="space-y-2.5">
                {ranking.map((r, i) => (
                  <div key={r.phone || i} className="flex items-center gap-3" data-testid={`ranking-item-${i}`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{r.name} {r.account_type === "comercio" && <span className="text-[10px] font-bold text-primary uppercase">comércio</span>}</p>
                      <p className="text-xs text-muted-foreground">{r.phone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-primary" style={{ fontFamily: "Manrope" }}>{r.indications}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">indicações · {brl(r.earned)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-5 space-y-3">
          {orders.length === 0 && <p className="text-muted-foreground text-sm text-center py-8" data-testid="no-admin-orders">Nenhum pedido ainda.</p>}
          {orders.map((o, i) => (
            <div key={o.id} className="bg-white rounded-2xl border border-border p-4" data-testid={`admin-order-${i}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{o.customer_name} — {o.phone}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}</p>
                  <p className="text-xs text-muted-foreground">{o.address.street}, {o.address.number} — {o.address.neighborhood}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")} · {o.payment_method}</p>
                  {o.loyalty_discount && <p className="text-xs font-bold text-orange-600 mt-1">🎁 Desconto de fidelidade</p>}
                </div>
                <p className="font-extrabold text-primary shrink-0" style={{ fontFamily: "Manrope" }}>{brl(o.total)}</p>
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => setOrderStatus(o.id, s)} data-testid={`order-${i}-status-${s}`}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${o.status === s ? "bg-primary text-white border-primary" : "bg-white border-input hover:bg-muted"}`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="products" className="mt-5 space-y-3">
          <button onClick={openNew} data-testid="add-product-button"
            className="w-full h-12 rounded-full border-2 border-dashed border-primary/50 text-primary font-bold flex items-center justify-center gap-2 hover:bg-accent transition-colors">
            <Plus className="w-5 h-5" /> Novo produto
          </button>
          {products.map((p, i) => (
            <div key={p.id} className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3" data-testid={`admin-product-${i}`}>
              {p.image_url && <img src={p.image_url} alt={p.name} className="w-14 h-14 rounded-xl object-cover" />}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{p.name}</p>
                <p className="text-sm text-primary font-bold">{brl(p.price)}</p>
                <span className={`text-[10px] font-bold uppercase ${p.active ? "text-green-600" : "text-red-500"}`}>{p.active ? "Ativo" : "Inativo"}</span>
              </div>
              <button onClick={() => openEdit(p)} data-testid={`edit-product-${i}`} className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteProduct(p.id)} data-testid={`delete-product-${i}`} className="w-10 h-10 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="coupons" className="mt-5 space-y-3">
          <button onClick={openNewCoupon} data-testid="add-coupon-button"
            className="w-full h-12 rounded-full border-2 border-dashed border-primary/50 text-primary font-bold flex items-center justify-center gap-2 hover:bg-accent transition-colors">
            <Plus className="w-5 h-5" /> Novo cupom
          </button>
          {coupons.length === 0 && <p className="text-muted-foreground text-sm text-center py-6" data-testid="no-coupons">Nenhum cupom criado.</p>}
          {coupons.map((c, i) => (
            <div key={c.id} className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3" data-testid={`admin-coupon-${i}`}>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-sm tracking-widest">{c.code}</p>
                <p className="text-sm text-primary font-bold">{c.type === "percent" ? `${c.value}% de desconto` : brl(c.value) + " de desconto"}</p>
                <div className="flex gap-2 mt-1">
                  <span className={`text-[10px] font-bold uppercase ${c.active ? "text-green-600" : "text-red-500"}`}>{c.active ? "Ativo" : "Inativo"}</span>
                  {c.first_purchase_only && <span className="text-[10px] font-bold uppercase text-orange-600">1ª compra</span>}
                </div>
              </div>
              <button onClick={() => openEditCoupon(c)} data-testid={`edit-coupon-${i}`} className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteCoupon(c.id)} data-testid={`delete-coupon-${i}`} className="w-10 h-10 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="businesses" className="mt-5 space-y-3">
          {businesses.length === 0 && <p className="text-muted-foreground text-sm text-center py-8" data-testid="no-admin-businesses">Nenhum comércio cadastrado.</p>}
          {businesses.map((b, i) => (
            <div key={b.user_id} className="bg-white rounded-2xl border border-border overflow-hidden" data-testid={`admin-business-${i}`}>
              {b.facade_path && (
                <img src={`${API}/files/${b.facade_path}`} alt={b.business_name} className="w-full h-36 object-cover" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm flex items-center gap-1.5"><Store className="w-4 h-4 text-primary shrink-0" /> {b.business_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.business_address}</p>
                    <p className="text-xs text-muted-foreground">Responsável: {b.name} · {b.phone}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shrink-0 ${b.business_status === "aprovado" ? "bg-green-100 text-green-700" : b.business_status === "recusado" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                    {b.business_status}
                  </span>
                </div>
                <div className="flex gap-2 mt-3">
                  {b.business_status !== "aprovado" && (
                    <button onClick={() => setBusinessStatus(b.user_id, "aprovado")} data-testid={`approve-business-${i}`}
                      className="flex-1 h-11 rounded-full bg-green-600 text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-green-700 transition-colors">
                      <Check className="w-4 h-4" /> Aprovar
                    </button>
                  )}
                  {b.business_status !== "recusado" && (
                    <button onClick={() => setBusinessStatus(b.user_id, "recusado")} data-testid={`reject-business-${i}`}
                      className="flex-1 h-11 rounded-full border border-red-300 text-red-600 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-red-50 transition-colors">
                      <X className="w-4 h-4" /> Recusar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="clients" className="mt-5 space-y-3">
          {resets.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2.5" data-testid="password-resets-box">
              <p className="font-bold text-sm text-amber-800">🔑 Pedidos de recuperação de senha</p>
              {resets.map((r, i) => (
                <div key={r.code} className="flex items-center justify-between gap-2 bg-white rounded-xl p-3" data-testid={`reset-request-${i}`}>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold tracking-widest text-lg" style={{ fontFamily: "Manrope" }} data-testid={`reset-code-${i}`}>{r.code}</p>
                    <a href={`https://wa.me/55${r.phone}?text=${encodeURIComponent(`Olá ${r.name.split(" ")[0]}! Seu código de recuperação de senha do site Santa Fé é: ${r.code} (válido por 30 minutos)`)}`}
                      target="_blank" rel="noopener noreferrer" data-testid={`reset-send-${i}`}
                      className="text-xs font-bold text-green-700 hover:underline">
                      Enviar no WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
          {clients.length === 0 && <p className="text-muted-foreground text-sm text-center py-8" data-testid="no-clients">Nenhum cliente cadastrado.</p>}
          {clients.map((c, i) => (
            <div key={c.user_id} className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3" data-testid={`admin-client-${i}`}>
              {c.picture ? <img src={c.picture} alt={c.name} className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" /> : <div className="w-10 h-10 rounded-full bg-accent" />}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold text-primary" style={{ fontFamily: "Manrope" }}>{c.order_count || 0}</p>
                <p className="text-[10px] text-muted-foreground uppercase">pedidos</p>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="settings" className="mt-5 space-y-4">
          {settings && (
            <>
              <div>
                <label className="font-medium text-sm block mb-1.5">Número do WhatsApp (com DDI, ex: 5583...)</label>
                <input value={settings.whatsapp_number} onChange={sset("whatsapp_number")} data-testid="settings-whatsapp" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-sm block mb-1.5">Seg–Sáb abre</label>
                  <input value={settings.hours_weekday_open} onChange={sset("hours_weekday_open")} data-testid="settings-weekday-open" className={inputCls} placeholder="07:00" />
                </div>
                <div>
                  <label className="font-medium text-sm block mb-1.5">Seg–Sáb fecha</label>
                  <input value={settings.hours_weekday_close} onChange={sset("hours_weekday_close")} data-testid="settings-weekday-close" className={inputCls} placeholder="18:00" />
                </div>
                <div>
                  <label className="font-medium text-sm block mb-1.5">Dom abre</label>
                  <input value={settings.hours_sunday_open} onChange={sset("hours_sunday_open")} data-testid="settings-sunday-open" className={inputCls} placeholder="07:00" />
                </div>
                <div>
                  <label className="font-medium text-sm block mb-1.5">Dom fecha</label>
                  <input value={settings.hours_sunday_close} onChange={sset("hours_sunday_close")} data-testid="settings-sunday-close" className={inputCls} placeholder="12:00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-sm block mb-1.5">Desconto fidelidade (%)</label>
                  <input value={settings.loyalty_discount_percent} onChange={sset("loyalty_discount_percent")} type="number" data-testid="settings-loyalty-percent" className={inputCls} />
                </div>
                <div>
                  <label className="font-medium text-sm block mb-1.5">Crédito por indicação (R$)</label>
                  <input value={settings.referral_credit_value ?? 5} onChange={sset("referral_credit_value")} type="number" step="0.5" data-testid="settings-referral-value" className={inputCls} />
                </div>
              </div>
              <p className={`text-sm font-bold ${settings.store_open ? "text-green-600" : "text-red-500"}`} data-testid="settings-store-status">
                Status atual: {settings.store_open ? "Aberta" : "Fechada"}
              </p>
              <button onClick={saveSettings} data-testid="save-settings-button"
                className="w-full h-14 rounded-full bg-secondary text-white text-lg font-bold flex items-center justify-center gap-2 hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform">
                <Save className="w-5 h-5" /> Salvar configurações
              </button>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Manrope" }}>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="font-medium text-sm block mb-1.5">Nome</label>
              <input value={pform.name} onChange={(e) => setPform((f) => ({ ...f, name: e.target.value }))} data-testid="product-form-name" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-sm block mb-1.5">Preço à vista (R$)</label>
                <input value={pform.price} onChange={(e) => setPform((f) => ({ ...f, price: e.target.value }))} type="number" step="0.01" data-testid="product-form-price" className={inputCls} />
              </div>
              <div>
                <label className="font-medium text-sm block mb-1.5">Preço no cartão (R$)</label>
                <input value={pform.card_price} onChange={(e) => setPform((f) => ({ ...f, card_price: e.target.value }))} type="number" step="0.01" data-testid="product-form-card-price" className={inputCls} placeholder="Opcional" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-sm block mb-1.5">Descrição</label>
                <input value={pform.description} onChange={(e) => setPform((f) => ({ ...f, description: e.target.value }))} data-testid="product-form-description" className={inputCls} placeholder="Botijão 13 kg" />
              </div>
              <div>
                <label className="font-medium text-sm block mb-1.5">Etiqueta</label>
                <input value={pform.tag} onChange={(e) => setPform((f) => ({ ...f, tag: e.target.value }))} data-testid="product-form-tag" className={inputCls} placeholder="Mais pedido" />
              </div>
            </div>
            <div>
              <label className="font-medium text-sm block mb-1.5">URL da foto (opcional — sem foto usa desenho)</label>
              <input value={pform.image_url} onChange={(e) => setPform((f) => ({ ...f, image_url: e.target.value }))} data-testid="product-form-image" className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={pform.active} onChange={(e) => setPform((f) => ({ ...f, active: e.target.checked }))} data-testid="product-form-active" className="w-5 h-5 accent-[#0284c7]" />
              Produto ativo (visível no site)
            </label>
            <button onClick={saveProduct} data-testid="product-form-save"
              className="w-full h-12 rounded-full bg-secondary text-white font-bold hover:bg-secondary/90 transition-colors">
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={couponDialogOpen} onOpenChange={setCouponDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Manrope" }}>{editingCoupon ? "Editar cupom" : "Novo cupom"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="font-medium text-sm block mb-1.5">Código</label>
              <input value={cform.code} onChange={(e) => setCform((f) => ({ ...f, code: e.target.value.toUpperCase() }))} data-testid="coupon-form-code" className={`${inputCls} uppercase`} placeholder="BEMVINDO" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-sm block mb-1.5">Tipo</label>
                <select value={cform.type} onChange={(e) => setCform((f) => ({ ...f, type: e.target.value }))} data-testid="coupon-form-type" className={inputCls}>
                  <option value="fixed">Valor fixo (R$)</option>
                  <option value="percent">Percentual (%)</option>
                </select>
              </div>
              <div>
                <label className="font-medium text-sm block mb-1.5">Valor</label>
                <input value={cform.value} onChange={(e) => setCform((f) => ({ ...f, value: e.target.value }))} type="number" step="0.5" data-testid="coupon-form-value" className={inputCls} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={cform.first_purchase_only} onChange={(e) => setCform((f) => ({ ...f, first_purchase_only: e.target.checked }))} data-testid="coupon-form-first-purchase" className="w-5 h-5 accent-[#0284c7]" />
              Válido apenas na primeira compra
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={cform.active} onChange={(e) => setCform((f) => ({ ...f, active: e.target.checked }))} data-testid="coupon-form-active" className="w-5 h-5 accent-[#0284c7]" />
              Cupom ativo
            </label>
            <button onClick={saveCoupon} data-testid="coupon-form-save"
              className="w-full h-12 rounded-full bg-secondary text-white font-bold hover:bg-secondary/90 transition-colors">
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
