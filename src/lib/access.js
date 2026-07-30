import { createContext, useContext } from "react";

// Fournit à tout composant de l'arbre le rôle courant et si l'interface doit
// être en lecture seule (rôle "visualisation"), sans avoir à faire passer ces
// informations manuellement de composant en composant.
export const AccessContext = createContext({
  role: "admin",
  readOnly: false,
  username: null,
});

export function useAccess() {
  return useContext(AccessContext);
}