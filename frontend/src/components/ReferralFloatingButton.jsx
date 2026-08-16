import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "../context/AuthContext";

export const ReferralFloatingButton = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!user) {
      setCode("");
      return;
    }
    axios.get(`${API}/referral/me`, { withCredentials: true })
      .then((response) => setCode(response.data.code))
      .catch(() => setCode(""));
  }, [user]);

  const shareReferral = async () => {
    if (!user) {
      toast.message("Crie sua conta para ganhar seu link de indicação.");
      navigate("/entrar");
      return;
    }
    if (!code) {
      navigate("/meus-pedidos");
      return;
    }
    const link = `${window.location.origin}/?ref=${code}`;
    const text = `Nem comprei e já ganhei na Santa Fé! Peça gás e água pelo meu link: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Santa Fé Distribuidora", text, url: link });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(link);
    toast.success("Seu link foi copiado para compartilhar!");
  };

  return (
    <button onClick={shareReferral} data-testid="floating-referral-share-button" title="Compartilhar e ganhar"
      className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl hover:bg-[#20bd5a] active:scale-[0.95] transition-colors transition-transform">
      <Share2 className="w-6 h-6" />
    </button>
  );
};