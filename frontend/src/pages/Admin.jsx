import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Save } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUSES = ["enviado", "em_entrega", "entregue", "cancelado"];
const STATUS_LABELS = { enviado: "Enviado", em_entrega: "Em entrega", entregue: "Entregue", cancelado: "Cancelado" };
const inputCls = "w-full h-12 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring";

const EMPTY_PRODUCT = { name: "", price: "", image_url: "", active: true };

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

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) navigate("/");
  }, [loading, user, navigate]);

  const loadAll = useCallback(() => {
    const opts = { withCredentials: true };
    axios.get(`${API}/admin/products`, opts).then((r) => setProducts(r.data));
    axios.get(`${API}/admin/orders`, opts).then((r) => setOrders(r.data));
    axios.get(`${API}/admin/clients`, opts).then((r) => setClients(r.data));
    axios.get(`${API}/settings`).then((r) => setSettings(r.data));
  }, []);

  useEffect(() => {
    if (user?.role === "admin") loadAll();
  }, [user, loadAll]);

  if (loading || !user || user.role !== "admin") return null;

  const openNew = () => { setEditing(null); setPform(EMPTY_PRODUCT); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setPform({ name: p.name, price: p.price, image_url: p.image_url, active: p.active }); setDialogOpen(true); };

  const saveProduct = async () => {
    const body = { ...pform, price: parseFloat(pform.price) };
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
      }, { withCredentials: true });
      setSettings(r.data);
      toast.success("Configurações salvas!");
    } catch { toast.error("Erro ao salvar"); }
  };

  const sset = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="max-w-md mx-auto px-5 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight mt-6" style={{ fontFamily: "Manrope" }} data-testid="admin-title">Painel Admin</h1>

      <Tabs defaultValue="orders" className="mt-5">
        <TabsList className="grid grid-cols-4 w-full rounded-full h-11">
          <TabsTrigger value="orders" className="rounded-full text-xs" data-testid="tab-orders">Pedidos</TabsTrigger>
          <TabsTrigger value="products" className="rounded-full text-xs" data-testid="tab-products">Produtos</TabsTrigger>
          <TabsTrigger value="clients" className="rounded-full text-xs" data-testid="tab-clients">Clientes</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-full text-xs" data-testid="tab-settings">Config</TabsTrigger>
        </TabsList>

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

        <TabsContent value="clients" className="mt-5 space-y-3">
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
              <div>
                <label className="font-medium text-sm block mb-1.5">Desconto fidelidade (%)</label>
                <input value={settings.loyalty_discount_percent} onChange={sset("loyalty_discount_percent")} type="number" data-testid="settings-loyalty-percent" className={inputCls} />
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
            <div>
              <label className="font-medium text-sm block mb-1.5">Preço (R$)</label>
              <input value={pform.price} onChange={(e) => setPform((f) => ({ ...f, price: e.target.value }))} type="number" step="0.01" data-testid="product-form-price" className={inputCls} />
            </div>
            <div>
              <label className="font-medium text-sm block mb-1.5">URL da foto</label>
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
    </div>
  );
}
