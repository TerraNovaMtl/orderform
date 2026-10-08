"use client";

import { useEffect, useState } from "react";

export function LocalInstanceBadge() {
  const [local, setLocal] = useState(false);
  useEffect(() => {
    const hostname = window.location.hostname;
    setLocal(
      process.env.NODE_ENV === "development" ||
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname.endsWith(".localhost"),
    );
  }, []);
  if (!local) return null;
  return <span className="local-instance-badge">LOCAL INSTANCE</span>;
}
