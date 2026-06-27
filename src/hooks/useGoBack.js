import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

// Back navigation that uses the history stack so you return to wherever you
// came from (e.g. Asetukset → back to MINÄ, not always home). Falls back to a
// route when there's no in-app history (deep link / hard refresh).
export function useGoBack(fallback = "/") {
  const navigate = useNavigate();
  return useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback);
  }, [navigate, fallback]);
}
