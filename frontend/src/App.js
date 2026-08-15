import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { AuthCallback } from "./components/AuthCallback";
import { Header } from "./components/Header";
import Home from "./pages/Home";
import OrderFlow from "./pages/OrderFlow";
import MyOrders from "./pages/MyOrders";
import Admin from "./pages/Admin";

function AppRouter() {
  const location = useLocation();
  // Detect session_id synchronously during render (read from useLocation().hash, NOT window.location.hash)
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pedido/:productId" element={<OrderFlow />} />
        <Route path="/meus-pedidos" element={<MyOrders />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
