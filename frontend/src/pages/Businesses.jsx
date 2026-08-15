import { useState, useEffect } from "react";
import axios from "axios";
import { Store, MapPin, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { API } from "../context/AuthContext";

export default function Businesses() {
  const [businesses, setBusinesses] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    axios.get(`${API}/businesses`).then((r) => setBusinesses(r.data));
    axios.get(`${API}/settings`).then((r) => setSettings(r.data));
  }, []);

  const waNumber = settings?.whatsapp_number || "5583999170131";

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <div className="max-w-xl mt-10">
        <span className="text-xs font-bold uppercase tracking-widest text-secondary">Parceiros Santa Fé</span>
        <h1 className="text-3xl font-extrabold tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>Comércios cadastrados</h1>
        <p className="text-muted-foreground mt-2">Comércios de João Pessoa que confiam na Santa Fé. Preço para comércio é negociado direto com nosso atendimento.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {businesses === null ? (
          <div className="col-span-full flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : businesses.length === 0 ? (
          <div className="col-span-full text-center py-16 text-muted-foreground" data-testid="no-businesses">
            <Store className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum comércio publicado ainda. Seja o primeiro!</p>
          </div>
        ) : (
          businesses.map((b, i) => (
            <article key={b.business_name || i} className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden fade-up" style={{ animationDelay: `${i * 70}ms` }} data-testid={`business-card-${i}`}>
              {b.facade_url ? (
                <img src={`${process.env.REACT_APP_BACKEND_URL}${b.facade_url}`} alt={b.business_name} className="w-full h-44 object-cover" />
              ) : (
                <div className="w-full h-44 bg-accent flex items-center justify-center"><Store className="w-12 h-12 text-primary/40" /></div>
              )}
              <div className="p-5">
                <h3 className="font-bold text-lg tracking-tight" style={{ fontFamily: "Manrope" }}>{b.business_name}</h3>
                {b.business_address && (
                  <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /> {b.business_address}</p>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="mt-12 rounded-3xl bg-[#0c2d48] text-white p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-xl">
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "Manrope" }}>Tem um comércio?</h2>
          <p className="text-white/80 mt-2 text-sm">Cadastre-se, divulgue sua fachada aqui de graça e negocie preço especial de comércio direto com a gente. Você também acumula créditos de indicação!</p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <Link to="/entrar" data-testid="business-register-link"
            className="h-12 px-6 rounded-full bg-secondary text-white font-bold flex items-center hover:bg-secondary/90 transition-colors">
            Cadastrar meu comércio
          </Link>
          <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent("Olá! Tenho um comércio e quero negociar preço especial com a Santa Fé.")}`}
            target="_blank" rel="noopener noreferrer" data-testid="business-whatsapp-link"
            className="h-12 px-6 rounded-full border-2 border-white/25 text-white font-bold flex items-center gap-2 hover:bg-white/10 transition-colors">
            <MessageCircle className="w-4 h-4" /> Negociar preço
          </a>
        </div>
      </div>
    </div>
  );
}
