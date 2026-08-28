import { escapeHTML } from "../core/utils.js";
import {
  MODES_PAIEMENT,
  LIBELLES_MODES,
  LIBELLES_OPERATEURS,
  normaliserNumeroBenin,
  estNumeroBeninValide,
  suggestOperateur,
  formaterNumeroAffichage,
  normaliserIban,
  estIbanBjValide,
  formaterIbanAffichage,
  CHAMPS_PAR_MODE,
  CHAMPS_OBLIGATOIRES_PAR_MODE,
} from "../core/payment.js";

// ============================================================
// CHAMPS DE COORDONNÉES DE PAIEMENT
// ------------------------------------------------------------
// Les champs affichés dépendent du mode choisi : un salarié payé en espèces
// n'a ni IBAN ni numéro mobile money.
//
// Deux exigences de confort tenues ici :
//   - passer de « virement » à « mobile money » puis revenir NE PERD PAS
//     l'IBAN déjà saisi. On ne punit pas une hésitation.
//   - les champs masqués ne sont jamais envoyés au serveur : changer d'avis
//     ne laisse pas traîner un IBAN sur un salarié payé en espèces.
// ============================================================

// Mémoire de saisie par préfixe de formulaire ('f' ou 'edit'). Vidée à
// l'ouverture du formulaire, pas au changement de mode.
const brouillons = {};

// Coordonnées gelées : un lot de règlement est ouvert pour ce salarié, ses
// coordonnées ne doivent plus bouger jusqu'à la clôture.
const gel = {};

function champ(prefixe, nom) {
  return document.getElementById(`${prefixe}-${nom}`);
}

function valeurBrouillon(prefixe, nom) {
  return brouillons[prefixe]?.[nom] ?? "";
}

// ------------------------------------------------------------
// Rendu
// ------------------------------------------------------------

function blocVirement(prefixe, estGele) {
  const ro = estGele ? "readonly disabled" : "";
  const fond = estGele ? "bg-slate-100" : "bg-white";
  return `
    <div id="${prefixe}-pay-virement" class="pay-mode-block grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="md:col-span-2">
        <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">IBAN <span class="text-red-400">*</span></label>
        <input id="${prefixe}-iban" ${ro} maxlength="34"
          oninput="window.onIbanInput('${prefixe}')" onblur="window.onIbanBlur('${prefixe}')"
          class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm font-mono tracking-wide outline-none transition-colors"
          placeholder="BJ66 BJ06 1010 0100 1443 9000 0769">
        <p id="${prefixe}-iban-msg" class="text-[10px] mt-1 hidden"></p>
      </div>
      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Banque</label>
        <input id="${prefixe}-banque_nom" ${ro} class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm outline-none" placeholder="Ex : Bank of Africa">
      </div>
      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">BIC / SWIFT</label>
        <input id="${prefixe}-bic" ${ro} class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm font-mono outline-none" placeholder="Facultatif">
      </div>
      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Code banque</label>
        <input id="${prefixe}-banque_code" ${ro} maxlength="5" class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm font-mono outline-none" placeholder="5 chiffres">
      </div>
      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Code guichet</label>
        <input id="${prefixe}-banque_guichet" ${ro} maxlength="5" class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm font-mono outline-none" placeholder="5 chiffres">
      </div>
    </div>`;
}

function blocMomo(prefixe, estGele) {
  const ro = estGele ? "readonly disabled" : "";
  const fond = estGele ? "bg-slate-100" : "bg-white";
  const options = Object.keys(LIBELLES_OPERATEURS)
    .map((o) => `<option value="${o}">${escapeHTML(LIBELLES_OPERATEURS[o])}</option>`)
    .join("");

  return `
    <div id="${prefixe}-pay-momo" class="pay-mode-block grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Numéro Mobile Money <span class="text-red-400">*</span></label>
        <input id="${prefixe}-momo_numero" ${ro} type="tel" maxlength="20"
          oninput="window.onMomoInput('${prefixe}')" onblur="window.onMomoBlur('${prefixe}')"
          class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm font-mono tracking-wide outline-none transition-colors"
          placeholder="01 97 12 34 56">
        <p id="${prefixe}-momo_numero-msg" class="text-[10px] mt-1 hidden"></p>
      </div>
      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Opérateur <span class="text-red-400">*</span></label>
        <select id="${prefixe}-momo_operateur" ${estGele ? "disabled" : ""} class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm font-bold outline-none">
          <option value="">— À préciser —</option>
          ${options}
        </select>
        <p id="${prefixe}-operateur-hint" class="text-[10px] mt-1 text-slate-400 hidden"></p>
      </div>
    </div>`;
}

function blocCheque(prefixe, estGele) {
  const ro = estGele ? "readonly disabled" : "";
  const fond = estGele ? "bg-slate-100" : "bg-white";
  return `
    <div id="${prefixe}-pay-cheque" class="pay-mode-block">
      <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Banque émettrice</label>
      <input id="${prefixe}-banque_nom_cheque" ${ro} class="w-full p-3 ${fond} border border-slate-200 rounded-xl text-sm outline-none" placeholder="Ex : Bank of Africa">
      <p class="text-[10px] text-slate-400 mt-1">Le numéro du chèque se saisit au moment de constater le paiement, pas ici.</p>
    </div>`;
}

// Construit tout le bloc. Appelée à l'ouverture du formulaire.
export function renderPaymentFields(prefixe, valeurs = {}, options = {}) {
  const conteneur = document.getElementById(`${prefixe}-payment-block`);
  if (!conteneur) return;

  const estGele = !!options.gele;
  gel[prefixe] = estGele;
  brouillons[prefixe] = { ...valeurs };

  const mode = valeurs.mode_paiement_defaut || "ESPECES";
  const titre = conteneur.querySelector("p");

  const optionsMode = MODES_PAIEMENT
    .map((m) => `<option value="${m}" ${m === mode ? "selected" : ""}>${escapeHTML(LIBELLES_MODES[m])}</option>`)
    .join("");

  conteneur.innerHTML = `
    ${titre ? titre.outerHTML : ""}

    ${estGele ? `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 flex items-start gap-2">
        <i class="fa-solid fa-lock mt-0.5"></i>
        <span><strong>Coordonnées gelées.</strong> Un règlement est en cours pour la période :
        elles ne peuvent pas être modifiées tant qu'il n'est pas clôturé.</span>
      </div>` : ""}

    <div>
      <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Mode de paiement</label>
      <select id="${prefixe}-mode_paiement_defaut" ${estGele ? "disabled" : ""}
        onchange="window.onPaymentModeChange('${prefixe}')"
        class="w-full p-3 ${estGele ? "bg-slate-100" : "bg-white"} border border-slate-200 rounded-xl text-sm font-bold outline-none">
        ${optionsMode}
      </select>
    </div>

    <div id="${prefixe}-pay-fields" class="space-y-3">
      ${blocVirement(prefixe, estGele)}
      ${blocMomo(prefixe, estGele)}
      ${blocCheque(prefixe, estGele)}
    </div>

    <div id="${prefixe}-pay-titulaire" class="pay-mode-block">
      <label class="flex items-center gap-2 text-xs mb-2">
        <input type="checkbox" id="${prefixe}-titulaire_self" ${estGele ? "disabled" : ""} checked
          onchange="window.onTitulaireSelfChange('${prefixe}')" class="w-4 h-4 rounded border-slate-300">
        <span class="font-medium text-slate-600">Le titulaire du compte est le salarié lui-même</span>
      </label>
      <input id="${prefixe}-titulaire_compte" ${estGele ? "readonly disabled" : ""}
        class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm outline-none"
        placeholder="Nom du titulaire du compte">
      <p class="text-[10px] text-slate-400 mt-1">
        À renseigner si le compte est au nom d'un tiers (conjoint, mandataire) : c'est ce nom que la banque contrôle.
      </p>
    </div>`;

  // Réinjection des valeurs après construction du DOM.
  const poser = (nom, valeur) => {
    const el = champ(prefixe, nom);
    if (el && valeur !== undefined && valeur !== null) el.value = valeur;
  };
  poser("iban", valeurs.iban ? formaterIbanAffichage(valeurs.iban) : "");
  poser("banque_nom", valeurs.banque_nom);
  poser("bic", valeurs.bic);
  poser("banque_code", valeurs.banque_code);
  poser("banque_guichet", valeurs.banque_guichet);
  poser("banque_nom_cheque", valeurs.banque_nom);
  poser("momo_numero", valeurs.momo_numero ? formaterNumeroAffichage(valeurs.momo_numero) : "");
  poser("momo_operateur", valeurs.momo_operateur || "");
  poser("titulaire_compte", valeurs.titulaire_compte);

  // Le titulaire n'est « soi-même » que si le champ est vide ou identique au nom.
  const caseSelf = champ(prefixe, "titulaire_self");
  const titulaireRenseigne = !!valeurs.titulaire_compte;
  if (caseSelf) caseSelf.checked = !titulaireRenseigne;
  appliquerEtatTitulaire(prefixe);

  onPaymentModeChange(prefixe, true);
}

// ------------------------------------------------------------
// Réactions à la saisie
// ------------------------------------------------------------

export function onPaymentModeChange(prefixe, initial = false) {
  const select = champ(prefixe, "mode_paiement_defaut");
  if (!select) return;
  const mode = select.value;

  // Avant de masquer, on mémorise ce qui a été tapé : revenir en arrière
  // doit retrouver la saisie.
  if (!initial) memoriserBrouillon(prefixe);

  const bascule = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !visible);
  };

  bascule(`${prefixe}-pay-virement`, mode === "VIREMENT");
  bascule(`${prefixe}-pay-momo`, mode === "MOBILE_MONEY");
  bascule(`${prefixe}-pay-cheque`, mode === "CHEQUE");
  bascule(`${prefixe}-pay-titulaire`, mode !== "ESPECES");

  // Restauration de ce qui avait été tapé pour ce mode.
  if (!initial) restaurerBrouillon(prefixe, mode);
}

function memoriserBrouillon(prefixe) {
  brouillons[prefixe] = brouillons[prefixe] || {};
  for (const nom of ["iban", "banque_nom", "bic", "banque_code", "banque_guichet",
                     "momo_numero", "momo_operateur", "titulaire_compte", "banque_nom_cheque"]) {
    const el = champ(prefixe, nom);
    if (el && el.value) brouillons[prefixe][nom] = el.value;
  }
}

function restaurerBrouillon(prefixe, mode) {
  const b = brouillons[prefixe] || {};
  const champsDuMode = CHAMPS_PAR_MODE[mode] || [];
  for (const nom of champsDuMode) {
    const el = champ(prefixe, nom);
    if (el && !el.value && b[nom]) el.value = b[nom];
  }
}

function marquer(el, msgEl, etat, texte) {
  if (!el) return;
  el.classList.remove("border-slate-200", "border-emerald-400", "border-red-400", "border-amber-400");
  if (etat === "ok") el.classList.add("border-emerald-400");
  else if (etat === "erreur") el.classList.add("border-red-400");
  else if (etat === "avertissement") el.classList.add("border-amber-400");
  else el.classList.add("border-slate-200");

  if (!msgEl) return;
  if (!texte) {
    msgEl.classList.add("hidden");
    msgEl.textContent = "";
    return;
  }
  msgEl.classList.remove("hidden", "text-red-500", "text-amber-600", "text-emerald-600");
  msgEl.classList.add(
    etat === "erreur" ? "text-red-500" : etat === "avertissement" ? "text-amber-600" : "text-emerald-600",
  );
  msgEl.textContent = texte;
}

export function onMomoInput(prefixe) {
  const el = champ(prefixe, "momo_numero");
  const msg = document.getElementById(`${prefixe}-momo_numero-msg`);
  const hint = document.getElementById(`${prefixe}-operateur-hint`);
  if (!el) return;

  const brut = el.value.trim();
  if (!brut) return marquer(el, msg, "neutre", "");

  const normalise = normaliserNumeroBenin(brut);
  if (!normalise) {
    // Pendant la frappe, on n'affiche pas d'erreur tant que la longueur
    // n'est pas atteinte : on ne réprimande pas un numéro en cours de saisie.
    const chiffres = brut.replace(/\D/g, "");
    if (chiffres.length < 10) return marquer(el, msg, "neutre", "");
    return marquer(el, msg, "erreur", "Numéro béninois attendu : 10 chiffres commençant par 01.");
  }

  marquer(el, msg, "ok", "");

  // Suggestion d'opérateur — jamais imposée : la portabilité fait qu'un
  // numéro peut avoir changé d'opérateur.
  const select = champ(prefixe, "momo_operateur");
  const suggere = suggestOperateur(normalise);
  if (select && suggere && !select.value) select.value = suggere;

  if (hint) {
    if (suggere) {
      hint.textContent = `Suggéré d'après le préfixe. Corrigez si le numéro a été porté.`;
      hint.classList.remove("hidden");
    } else {
      hint.textContent = "Préfixe inconnu : choisissez l'opérateur manuellement.";
      hint.classList.remove("hidden");
    }
  }
}

export function onMomoBlur(prefixe) {
  const el = champ(prefixe, "momo_numero");
  if (!el || !el.value.trim()) return;
  const normalise = normaliserNumeroBenin(el.value);
  if (normalise) el.value = formaterNumeroAffichage(normalise);
}

export function onIbanInput(prefixe) {
  const el = champ(prefixe, "iban");
  const msg = document.getElementById(`${prefixe}-iban-msg`);
  if (!el) return;

  const brut = el.value.trim();
  if (!brut) return marquer(el, msg, "neutre", "");

  const compact = normaliserIban(brut) || "";
  if (compact.length < 28) return marquer(el, msg, "neutre", "");

  const res = estIbanBjValide(compact);
  if (!res.valide) return marquer(el, msg, "erreur", res.raison);
  if (res.avertissement) return marquer(el, msg, "avertissement", res.raison);
  marquer(el, msg, "ok", "");
}

export function onIbanBlur(prefixe) {
  const el = champ(prefixe, "iban");
  if (!el || !el.value.trim()) return;
  const compact = normaliserIban(el.value);
  if (compact) el.value = formaterIbanAffichage(compact);
}

function appliquerEtatTitulaire(prefixe) {
  const caseSelf = champ(prefixe, "titulaire_self");
  const input = champ(prefixe, "titulaire_compte");
  if (!caseSelf || !input) return;

  const soi = caseSelf.checked;
  input.disabled = soi || gel[prefixe];
  input.classList.toggle("bg-slate-100", soi || gel[prefixe]);
  input.classList.toggle("bg-white", !soi && !gel[prefixe]);
  if (soi) input.value = "";
}

export function onTitulaireSelfChange(prefixe) {
  appliquerEtatTitulaire(prefixe);
  const input = champ(prefixe, "titulaire_compte");
  if (input && !input.disabled) input.focus();
}

// ------------------------------------------------------------
// Lecture pour envoi au serveur
// ------------------------------------------------------------

// Renvoie { valeurs, erreurs }. Les champs sans rapport avec le mode choisi
// sont explicitement mis à null : changer d'avis ne doit pas laisser un IBAN
// sur un salarié payé en espèces.
export function collectPaymentFields(prefixe) {
  const select = champ(prefixe, "mode_paiement_defaut");
  if (!select) return { valeurs: {}, erreurs: [] };

  const mode = select.value;
  const erreurs = [];

  const valeurs = {
    mode_paiement_defaut: mode,
    iban: null,
    banque_nom: null,
    banque_code: null,
    banque_guichet: null,
    bic: null,
    momo_numero: null,
    momo_operateur: null,
    titulaire_compte: null,
  };

  const lire = (nom) => (champ(prefixe, nom)?.value || "").trim();

  if (mode === "VIREMENT") {
    const iban = normaliserIban(lire("iban"));
    if (iban) {
      const res = estIbanBjValide(iban);
      if (!res.valide) erreurs.push(res.raison);
      valeurs.iban = iban;
    }
    valeurs.banque_nom = lire("banque_nom") || null;
    valeurs.banque_code = lire("banque_code") || null;
    valeurs.banque_guichet = lire("banque_guichet") || null;
    valeurs.bic = lire("bic") || null;
  }

  if (mode === "MOBILE_MONEY") {
    const brut = lire("momo_numero");
    if (brut) {
      const normalise = normaliserNumeroBenin(brut);
      if (!normalise) erreurs.push("Numéro Mobile Money invalide : 10 chiffres commençant par 01.");
      valeurs.momo_numero = normalise;
    }
    valeurs.momo_operateur = lire("momo_operateur") || null;
    if (valeurs.momo_numero && !valeurs.momo_operateur) {
      erreurs.push("Précisez l'opérateur du numéro Mobile Money.");
    }
  }

  if (mode === "CHEQUE") {
    valeurs.banque_nom = lire("banque_nom_cheque") || null;
  }

  if (mode !== "ESPECES") {
    const caseSelf = champ(prefixe, "titulaire_self");
    if (caseSelf && !caseSelf.checked) valeurs.titulaire_compte = lire("titulaire_compte") || null;
  }

  return { valeurs, erreurs };
}

// Les coordonnées manquantes n'empêchent pas d'enregistrer la fiche : un
// salarié peut être créé avant qu'on ait son IBAN. Elles bloqueront en
// revanche l'export du fichier de paiement, et le lot le signalera.
export function coordonneesIncompletes(prefixe) {
  const mode = champ(prefixe, "mode_paiement_defaut")?.value;
  const requis = CHAMPS_OBLIGATOIRES_PAR_MODE[mode] || [];
  const { valeurs } = collectPaymentFields(prefixe);
  return requis.filter((nom) => !valeurs[nom]);
}

export function estNumeroValide(v) {
  return estNumeroBeninValide(v);
}
