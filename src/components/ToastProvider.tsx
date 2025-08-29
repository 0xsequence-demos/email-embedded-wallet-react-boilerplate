import React, { createContext, useContext, useState, ReactNode } from "react";

type ToastVariant = "error" | "success" | "normal";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextProps {
  showToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (toast: Omit<Toast, "id">) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={containerStyle}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{ ...toastStyle, ...getVariantStyle(toast.variant) }}
          >
            <strong>{toast.title}</strong>
            {toast.description && <div>{toast.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.showToast;
};

// styles
const containerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "20px",
  right: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  zIndex: 9999,
};

const toastStyle: React.CSSProperties = {
  minWidth: "250px",
  padding: "12px 16px",
  borderRadius: "8px",
  color: "#fff",
  fontFamily: "sans-serif",
  boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
};

const getVariantStyle = (variant: ToastVariant): React.CSSProperties => {
  switch (variant) {
    case "error":
      return { backgroundColor: "#e74c3c" };
    case "success":
      return { backgroundColor: "#27ae60" };
    default:
      return { backgroundColor: "#34495e" };
  }
};
