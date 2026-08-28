// ============================================================================
//  payment.js — identité de paiement, côté navigateur
// ----------------------------------------------------------------------------
//  Miroir ESM de la partie « identité de paiement » de settlementFormat.js
//  (dépôt SIRH-BACKEND, CommonJS). Duplication assumée : deux dépôts déployés
//  séparément, aucune étape de build, donc aucun moyen de partager un module.
//
//  ⚠️ Toute correction de préfixe ou de règle de validation doit être
//  reportée dans settlementFormat.js côté backend, et inversement. Le backend
//  reste la seule autorité : cette copie sert à valider à la saisie pour que
//  l'utilisateur voie son erreur immédiatement, pas à garantir quoi que ce
//  soit.
// ============================================================================

export const MODES_PAIEMENT = ["VIREMENT", "MOBILE_MONEY", "ESPECES", "CHEQUE"];

export const LIBELLES_MODES = {
  VIREMENT: "Virement bancaire",
  MOBILE_MONEY: "Mobile Money",
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
};

export const LIBELLES_OPERATEURS = {
  MTN: "MTN",
  MOOV: "Moov Africa",
  CELTIIS: "Celtiis",
};

// Préfixes attribués par l'ARCEP. Depuis le 30/11/2024, tous les numéros
// béninois font 10 chiffres et commencent par 01.
//
// ⚠️ LA PORTABILITÉ DES NUMÉROS EXISTE. Ces préfixes ne servent qu'à
// PRÉ-SUGGÉRER l'opérateur à la saisie. L'utilisateur doit toujours pouvoir
// corriger : un numéro porté chez un autre opérateur enverrait le paiement
// au mauvais endroit.
export const PREFIXES_OPERATEURS = {
  MTN: [
    "0142", "0146", "0150", "0151", "0152", "0153", "0154", "0156", "0157",
    "0159", "0161", "0162", "0166", "0167", "0169", "0190", "0191", "0196",
    "0197",
  ],
  MOOV: [
    "0145", "0155", "0158", "0160", "0163", "0164", "0165", "0168", "0194",
    "0195", "0198", "0199",
  ],
  CELTIIS: [
    "0120", "0121", "0122", "0123", "0124", "0128", "0129", "0140", "0141",
    "0143", "0144", "0147", "0148", "0149", "0192", "0193",
  ],
};

export function normaliserNumeroBenin(valeur) {
  if (valeur === null || valeur === undefined) return null;

  let n = String(valeur).replace(/[\s.\-()]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  if (n.startsWith("00229")) n = n.slice(5);
  else if (n.startsWith("229")) n = n.slice(3);

  if (!/^\d+$/.test(n)) return null;
  if (n.length !== 10) return null;
  if (!n.startsWith("01")) return null;

  return n;
}

export function estNumeroBeninValide(valeur) {
  return normaliserNumeroBenin(valeur) !== null;
}

// Suggestion, jamais décision : renvoie null sur un préfixe inconnu plutôt
// qu'un opérateur par défaut.
export function suggestOperateur(valeur) {
  const n = normaliserNumeroBenin(valeur);
  if (!n) return null;
  const prefixe = n.slice(0, 4);
  for (const operateur of Object.keys(PREFIXES_OPERATEURS)) {
    if (PREFIXES_OPERATEURS[operateur].includes(prefixe)) return operateur;
  }
  return null;
}

// Affichage lisible : 01 97 12 34 56
export function formaterNumeroAffichage(valeur) {
  const n = normaliserNumeroBenin(valeur);
  if (!n) return String(valeur ?? "");
  return `${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)} ${n.slice(8, 10)}`;
}

export function normaliserIban(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const v = String(valeur).replace(/[\s.\-]/g, "").toUpperCase();
  return v || null;
}

function _mod97(ibanCompact) {
  const reorganise = ibanCompact.slice(4) + ibanCompact.slice(0, 4);
  let reste = 0;
  for (const c of reorganise) {
    let chiffres;
    if (c >= "0" && c <= "9") chiffres = c;
    else if (c >= "A" && c <= "Z") chiffres = String(c.charCodeAt(0) - 55);
    else return null;
    for (const d of chiffres) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste;
}

// Une clé de contrôle fausse AVERTIT sans bloquer : des RIB béninois
// réellement en circulation échouent au mod-97, et empêcher la saisie
// coûterait plus cher que de signaler le doute.
export function estIbanBjValide(valeur) {
  const iban = normaliserIban(valeur);
  if (!iban) return { valide: false, raison: "IBAN vide." };

  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(iban)) {
    return { valide: false, raison: "L'IBAN contient des caractères non autorisés." };
  }
  if (!iban.startsWith("BJ")) {
    return { valide: false, raison: "Un IBAN béninois commence par BJ." };
  }
  if (iban.length !== 28) {
    return {
      valide: false,
      raison: `Un IBAN béninois fait 28 caractères (${iban.length} saisis).`,
    };
  }
  if (_mod97(iban) !== 1) {
    return {
      valide: true,
      avertissement: true,
      raison: "La clé de contrôle semble incorrecte. Vérifiez la saisie.",
    };
  }
  return { valide: true };
}

// Affichage par groupes de 4 : BJ66 BJ06 1010 …
export function formaterIbanAffichage(valeur) {
  const iban = normaliserIban(valeur);
  if (!iban) return String(valeur ?? "");
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

// Masque une coordonnée pour l'affichage dans un écran ou un reçu qui
// circule : on ne montre que les quatre derniers caractères.
export function masquerCoordonnee(valeur) {
  const v = String(valeur ?? "").replace(/\s/g, "");
  if (v.length <= 4) return v ? "****" : "";
  return "****" + v.slice(-4);
}

// Champs attendus selon le mode, pour savoir quoi valider et quoi envoyer.
export const CHAMPS_PAR_MODE = {
  VIREMENT: ["banque_nom", "banque_code", "banque_guichet", "iban", "bic", "titulaire_compte"],
  MOBILE_MONEY: ["momo_numero", "momo_operateur", "titulaire_compte"],
  CHEQUE: ["banque_nom", "titulaire_compte"],
  ESPECES: [],
};

// Champs sans lesquels aucun fichier de paiement n'est produisible.
export const CHAMPS_OBLIGATOIRES_PAR_MODE = {
  VIREMENT: ["iban"],
  MOBILE_MONEY: ["momo_numero", "momo_operateur"],
  CHEQUE: [],
  ESPECES: [],
};
