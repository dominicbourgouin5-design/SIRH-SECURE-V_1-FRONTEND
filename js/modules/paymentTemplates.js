import { AppState } from "../core/state.js";
import { SIRH_CONFIG } from "../core/config.js";
import { secureFetch } from "../core/api.js";
import { escapeHTML } from "../core/utils.js";

// ============================================================
// GABARITS DE PAIEMENT
// ------------------------------------------------------------
// Le comptable définit ici les colonnes des fichiers d'export (ce qu'on
// envoie à la banque ou à l'opérateur mobile money) et d'import (le fichier
// de retour après paiement). Ces formats changent d'un opérateur à l'autre
// et d'une entreprise à l'autre : ce sont des données, pas du code.
// ============================================================

// Métadonnées servies par le backend (listes blanches de sources et de
// formats). On les lit une fois plutôt que de les dupliquer ici, pour que
// frontend et backend ne puissent pas diverger silencieusement.
let META = null;

const LIBELLES_SOURCES = {
  reference: "Référence de règlement",
  montant: "Montant net",
  devise: "Devise",
  mode_paiement: "Mode de paiement",
  matricule: "Matricule",
  nom: "Nom du salarié",
  titulaire: "Titulaire du compte",
  iban: "IBAN",
  banque_nom: "Nom de la banque",
  banque_code: "Code banque",
  banque_guichet: "Code guichet",
  bic: "BIC / SWIFT",
  momo_numero: "Numéro mobile money",
  momo_operateur: "Opérateur mobile money",
  mois: "Mois du lot",
  annee: "Année du lot",
  libelle_lot: "Libellé du lot",
  constante: "— Valeur fixe —",
};

const LIBELLES_FORMATS = {
  BRUT: "Tel quel",
  ENTIER: "Nombre entier",
  DECIMAL2: "Nombre à 2 décimales",
  MAJUSCULES: "MAJUSCULES",
  MSISDN_229: "Numéro international (2290197123456)",
  MSISDN_LOCAL: "Numéro local (0197123456)",
  IBAN_COMPACT: "IBAN sans espaces",
  IBAN_ESPACE: "IBAN par groupes de 4",
  DATE_FR: "Date JJ/MM/AAAA",
};

const LIBELLES_MODES = {
  VIREMENT: "Virement bancaire",
  MOBILE_MONEY: "Mobile Money",
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
};

// État de travail de l'éditeur, non enregistré tant que le comptable n'a pas
// cliqué sur Enregistrer.
let editeur = null;

async function chargerMeta() {
  if (META) return META;
  const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/payment-template-metadata`);
  if (!r.ok) throw new Error("Impossible de charger la configuration des paiements.");
  META = await r.json();
  return META;
}

export async function fetchPaymentTemplates() {
  const container = document.getElementById("payment-templates-list");
  if (!container) return;

  container.innerHTML =
    '<div class="col-span-full text-center py-10 text-slate-400"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

  try {
    await chargerMeta();
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-payment-templates?inclure_inactifs=true`);
    if (!r.ok) throw new Error("Lecture des gabarits impossible.");
    const data = await r.json();

    if (data.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
          <i class="fa-solid fa-table-columns text-3xl text-slate-200 mb-3"></i>
          <p class="text-sm font-bold text-slate-500">Aucun gabarit configuré</p>
          <p class="text-xs text-slate-400 mt-1">Créez-en un pour produire vos fichiers de paiement.</p>
        </div>`;
      return;
    }

    container.innerHTML = data.map((t) => {
      const nbColonnes = (t.export_config?.colonnes || []).length;
      const aImport = !!t.import_config?.colonne_reference;
      return `
      <div class="bg-white p-6 rounded-2xl border ${t.actif ? "border-slate-100" : "border-slate-200 opacity-60"} shadow-sm">
        <div class="flex items-start justify-between mb-3">
          <div>
            <h3 class="font-black text-slate-800">${escapeHTML(t.libelle)}</h3>
            <p class="text-[10px] font-mono text-slate-400 uppercase">${escapeHTML(t.code)}</p>
          </div>
          <span class="text-[9px] font-black uppercase px-2 py-1 rounded ${t.actif ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}">
            ${t.actif ? "Actif" : "Inactif"}
          </span>
        </div>

        <div class="flex flex-wrap gap-2 mb-4 text-[10px] font-bold">
          <span class="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">${LIBELLES_MODES[t.mode_paiement] || t.mode_paiement}</span>
          ${t.operateur ? `<span class="px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100">${escapeHTML(t.operateur)}</span>` : ""}
          <span class="px-2 py-1 rounded bg-slate-50 text-slate-600 border border-slate-100">${nbColonnes} colonne${nbColonnes > 1 ? "s" : ""}</span>
          <span class="px-2 py-1 rounded ${aImport ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"}">
            ${aImport ? "Retour configuré" : "Retour non configuré"}
          </span>
        </div>

        <div class="flex gap-2">
          <button onclick="window.openTemplateEditor(${t.id})" class="flex-1 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-600 transition-all">
            <i class="fa-solid fa-pen mr-1"></i> Modifier
          </button>
          ${t.actif ? `<button onclick="window.deletePaymentTemplate(${t.id})" class="px-3 py-2 bg-white border border-red-200 text-red-500 rounded-lg text-[10px] font-black uppercase hover:bg-red-50 transition-all">
            <i class="fa-solid fa-ban"></i>
          </button>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch (e) {
    console.error("Erreur chargement gabarits:", e);
    container.innerHTML =
      '<div class="col-span-full text-center py-10 text-red-400 text-xs">Erreur de chargement des gabarits.</div>';
  }
}

export async function openTemplateEditor(id) {
  await chargerMeta();

  let gabarit = {
    id: null,
    code: "",
    libelle: "",
    mode_paiement: "MOBILE_MONEY",
    operateur: "",
    devise: "XOF",
    actif: true,
    export_config: { format: "CSV", delimiteur: ";", encodage: "UTF8_BOM", nom_fichier: "", colonnes: [] },
    import_config: { colonne_reference: "", colonne_statut: "", colonne_transaction: "", colonne_date: "", colonne_montant: "", valeurs_succes: [], valeurs_echec: [], controle_montant: false },
  };

  if (id) {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-payment-templates?inclure_inactifs=true`);
    const tous = await r.json();
    const trouve = tous.find((t) => t.id === id);
    if (!trouve) return Swal.fire("Erreur", "Gabarit introuvable.", "error");
    gabarit = {
      ...trouve,
      export_config: { colonnes: [], ...trouve.export_config },
      import_config: { valeurs_succes: [], valeurs_echec: [], ...trouve.import_config },
    };
  }

  editeur = gabarit;
  rendreEditeur();
}

function optionsSource(valeurCourante) {
  return (META.sources || [])
    .map((s) => `<option value="${s}" ${s === valeurCourante ? "selected" : ""}>${escapeHTML(LIBELLES_SOURCES[s] || s)}</option>`)
    .join("");
}

function optionsFormat(valeurCourante) {
  return (META.formats || [])
    .map((f) => `<option value="${f}" ${f === valeurCourante ? "selected" : ""}>${escapeHTML(LIBELLES_FORMATS[f] || f)}</option>`)
    .join("");
}

function rendreLignesColonnes() {
  const colonnes = editeur.export_config.colonnes || [];
  if (colonnes.length === 0) {
    return '<tr><td colspan="6" class="text-center py-6 text-xs text-slate-400 italic">Aucune colonne. Ajoutez-en une pour commencer.</td></tr>';
  }

  return colonnes.map((col, i) => `
    <tr class="border-b border-slate-50">
      <td class="p-2">
        <input value="${escapeHTML(col.entete || "")}" oninput="window.majColonne(${i},'entete',this.value)"
          class="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold" placeholder="Ex : MSISDN">
      </td>
      <td class="p-2">
        <select onchange="window.majColonne(${i},'source',this.value)" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
          ${optionsSource(col.source)}
        </select>
      </td>
      <td class="p-2">
        ${col.source === "constante"
          ? `<input value="${escapeHTML(col.valeur || "")}" oninput="window.majColonne(${i},'valeur',this.value)"
               class="w-full p-2 border border-amber-200 bg-amber-50 rounded-lg text-xs" placeholder="Valeur fixe">`
          : `<select onchange="window.majColonne(${i},'format',this.value)" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
               ${optionsFormat(col.format || "BRUT")}
             </select>`}
      </td>
      <td class="p-2 text-center">
        <input type="checkbox" ${col.obligatoire ? "checked" : ""} onchange="window.majColonne(${i},'obligatoire',this.checked)"
          class="w-4 h-4 rounded border-slate-300" title="Si cette colonne est vide, la ligne est écartée du fichier">
      </td>
      <td class="p-2 text-right whitespace-nowrap">
        <button onclick="window.deplacerColonne(${i},-1)" class="p-1 text-slate-300 hover:text-slate-700" title="Monter"><i class="fa-solid fa-arrow-up"></i></button>
        <button onclick="window.deplacerColonne(${i},1)" class="p-1 text-slate-300 hover:text-slate-700" title="Descendre"><i class="fa-solid fa-arrow-down"></i></button>
        <button onclick="window.supprimerColonne(${i})" class="p-1 text-slate-300 hover:text-red-500" title="Supprimer"><i class="fa-solid fa-xmark"></i></button>
      </td>
    </tr>`).join("");
}

function rendreEditeur() {
  const e = editeur;
  const ic = e.import_config;

  Swal.fire({
    title: e.id ? "Modifier le gabarit" : "Nouveau gabarit",
    width: "62rem",
    showCancelButton: true,
    confirmButtonText: "Enregistrer",
    cancelButtonText: "Annuler",
    showDenyButton: true,
    denyButtonText: "Aperçu",
    denyButtonColor: "#0f766e",
    html: `
      <div class="text-left space-y-5 max-h-[65vh] overflow-y-auto pr-2">

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Libellé</label>
            <input id="tpl-libelle" value="${escapeHTML(e.libelle)}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="Ex : MTN MoMo — Paiement Multiple">
          </div>
          <div>
            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Code interne</label>
            <input id="tpl-code" value="${escapeHTML(e.code)}" class="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" placeholder="MTN_MOMO">
          </div>
          <div>
            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Mode de paiement</label>
            <select id="tpl-mode" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
              ${(META.modes || []).map((m) => `<option value="${m}" ${m === e.mode_paiement ? "selected" : ""}>${LIBELLES_MODES[m] || m}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Opérateur (mobile money)</label>
            <select id="tpl-operateur" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
              <option value="">— Aucun / indifférent —</option>
              ${(META.operateurs || []).map((o) => `<option value="${o}" ${o === e.operateur ? "selected" : ""}>${o}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-4">
          <p class="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Fichier à envoyer</p>
          <p class="text-[11px] text-slate-500 mb-3">Les colonnes sont produites dans cet ordre exact.</p>

          <div class="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Format</label>
              <select id="tpl-format" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
                <option value="CSV" ${e.export_config.format === "CSV" ? "selected" : ""}>CSV</option>
                <option value="XLSX" ${e.export_config.format === "XLSX" ? "selected" : ""}>Excel (XLSX)</option>
              </select>
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Séparateur</label>
              <input id="tpl-delimiteur" value="${escapeHTML(e.export_config.delimiteur || ";")}" class="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Nom du fichier</label>
              <input id="tpl-nomfichier" value="${escapeHTML(e.export_config.nom_fichier || "")}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="MTN_{mois}_{annee}">
            </div>
          </div>

          <table class="w-full text-left">
            <thead class="bg-slate-50 text-[9px] uppercase font-black text-slate-500">
              <tr>
                <th class="p-2">En-tête</th>
                <th class="p-2">Donnée</th>
                <th class="p-2">Format / valeur</th>
                <th class="p-2 text-center" title="Une ligne dont cette colonne est vide sera écartée du fichier">Obligatoire</th>
                <th class="p-2"></th>
              </tr>
            </thead>
            <tbody id="tpl-colonnes">${rendreLignesColonnes()}</tbody>
          </table>

          <button type="button" onclick="window.ajouterColonne()" class="mt-3 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase text-slate-600">
            <i class="fa-solid fa-plus mr-1"></i> Ajouter une colonne
          </button>
        </div>

        <div class="border-t border-slate-100 pt-4">
          <p class="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Fichier de retour</p>
          <p class="text-[11px] text-slate-500 mb-3">
            Après le paiement, indiquez où lire le résultat. <strong>La colonne de référence est indispensable</strong> :
            c'est elle qui relie chaque ligne du retour au bon salarié.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Colonne contenant la référence</label>
              <input id="tpl-imp-ref" value="${escapeHTML(ic.colonne_reference || "")}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="motif">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Colonne du statut</label>
              <input id="tpl-imp-statut" value="${escapeHTML(ic.colonne_statut || "")}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="statut">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Colonne de l'identifiant de transaction</label>
              <input id="tpl-imp-txn" value="${escapeHTML(ic.colonne_transaction || "")}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="transaction id">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Colonne de la date</label>
              <input id="tpl-imp-date" value="${escapeHTML(ic.colonne_date || "")}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="date">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Valeurs signifiant « payé » (séparées par des virgules)</label>
              <input id="tpl-imp-succes" value="${escapeHTML((ic.valeurs_succes || []).join(", "))}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="successful, ok, 00">
            </div>
            <div>
              <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Valeurs signifiant « échec »</label>
              <input id="tpl-imp-echec" value="${escapeHTML((ic.valeurs_echec || []).join(", "))}" class="w-full p-2 border border-slate-200 rounded-lg text-xs" placeholder="failed, rejected">
            </div>
            <div class="md:col-span-2">
              <label class="flex items-center gap-2 text-xs">
                <input type="checkbox" id="tpl-imp-controle" ${ic.controle_montant ? "checked" : ""} class="w-4 h-4 rounded border-slate-300">
                <span>Vérifier que le montant du retour correspond au montant attendu</span>
              </label>
              <input id="tpl-imp-montant" value="${escapeHTML(ic.colonne_montant || "")}" class="w-full mt-2 p-2 border border-slate-200 rounded-lg text-xs" placeholder="Colonne du montant (ex : montant)">
            </div>
          </div>

          <p class="text-[10px] text-slate-400 mt-3 leading-relaxed">
            <i class="fa-solid fa-shield-halved mr-1"></i>
            Un statut qui ne figure dans aucune des deux listes n'est jamais considéré comme payé :
            la ligne est signalée pour vérification manuelle.
          </p>
        </div>
      </div>`,
    didOpen: () => {
      // Les champs du formulaire sont lus au moment de valider, mais les
      // colonnes vivent dans `editeur` et se redessinent à chaque action.
    },
    preConfirm: () => lireEtValiderFormulaire(),
  }).then(async (res) => {
    if (res.isDenied) {
      // Aperçu : on relit le formulaire, on montre le rendu, puis on rouvre
      // l'éditeur pour ne pas perdre le travail en cours.
      lireFormulaireDansEditeur();
      await apercuGabarit();
      rendreEditeur();
      return;
    }
    if (res.isConfirmed && res.value) {
      await enregistrerGabarit(res.value);
    }
  });
}

function lireFormulaireDansEditeur() {
  const val = (id) => document.getElementById(id)?.value?.trim() ?? "";
  const listeDe = (id) =>
    val(id).split(",").map((s) => s.trim()).filter(Boolean);

  editeur.libelle = val("tpl-libelle");
  editeur.code = val("tpl-code");
  editeur.mode_paiement = val("tpl-mode");
  editeur.operateur = val("tpl-operateur");

  editeur.export_config.format = val("tpl-format") || "CSV";
  editeur.export_config.delimiteur = document.getElementById("tpl-delimiteur")?.value || ";";
  editeur.export_config.nom_fichier = val("tpl-nomfichier");

  editeur.import_config = {
    colonne_reference: val("tpl-imp-ref"),
    colonne_statut: val("tpl-imp-statut"),
    colonne_transaction: val("tpl-imp-txn"),
    colonne_date: val("tpl-imp-date"),
    colonne_montant: val("tpl-imp-montant"),
    valeurs_succes: listeDe("tpl-imp-succes"),
    valeurs_echec: listeDe("tpl-imp-echec"),
    controle_montant: !!document.getElementById("tpl-imp-controle")?.checked,
  };
}

function lireEtValiderFormulaire() {
  lireFormulaireDansEditeur();

  if (!editeur.libelle) {
    Swal.showValidationMessage("Le libellé est obligatoire.");
    return false;
  }
  if (!editeur.code) {
    Swal.showValidationMessage("Le code interne est obligatoire.");
    return false;
  }
  if ((editeur.export_config.colonnes || []).length === 0) {
    Swal.showValidationMessage("Ajoutez au moins une colonne au fichier à envoyer.");
    return false;
  }
  return { ...editeur };
}

async function apercuGabarit() {
  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/preview-payment-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        export_config: editeur.export_config,
        mode_paiement: editeur.mode_paiement,
      }),
    });
    const data = await r.json();

    if (!r.ok) {
      return Swal.fire({
        title: "Gabarit invalide",
        icon: "error",
        html: `<ul class="text-left text-xs space-y-1">${(data.details || [data.error]).map((d) => `<li>• ${escapeHTML(d)}</li>`).join("")}</ul>`,
      });
    }

    const tableau = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-[11px] border border-slate-200">
          <thead class="bg-slate-900 text-white">
            <tr>${data.entetes.map((h) => `<th class="px-3 py-2 font-bold whitespace-nowrap">${escapeHTML(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${data.lignes.map((l) => `<tr class="border-t border-slate-100">${l.map((c) => `<td class="px-3 py-2 font-mono whitespace-nowrap">${escapeHTML(c)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${data.erreurs.length > 0 ? `
        <div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-left">
          <p class="text-[10px] font-black uppercase text-amber-800 mb-1">${data.erreurs.length} ligne(s) écartée(s)</p>
          <p class="text-[11px] text-amber-900 mb-2">${escapeHTML(data.note || "")}</p>
          <ul class="text-[11px] text-amber-900 space-y-1">
            ${data.erreurs.map((e) => `<li>• ${escapeHTML(e.nom || e.reference)} — ${escapeHTML(e.motif)}</li>`).join("")}
          </ul>
        </div>` : ""}`;

    await Swal.fire({
      title: "Aperçu sur des données d'exemple",
      width: "58rem",
      html: tableau,
      confirmButtonText: "Retour à l'édition",
    });
  } catch (e) {
    Swal.fire("Erreur", "Impossible de générer l'aperçu.", "error");
  }
}

async function enregistrerGabarit(gabarit) {
  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/save-payment-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gabarit),
    });
    const data = await r.json();

    if (!r.ok) {
      return Swal.fire({
        title: "Enregistrement refusé",
        icon: "error",
        html: `<ul class="text-left text-xs space-y-1">${(data.details || [data.error]).map((d) => `<li>• ${escapeHTML(d)}</li>`).join("")}</ul>`,
      });
    }

    await Swal.fire("Enregistré", "Le gabarit a été enregistré.", "success");
    fetchPaymentTemplates();
  } catch (e) {
    Swal.fire("Erreur", "Impossible d'enregistrer le gabarit.", "error");
  }
}

export async function deletePaymentTemplate(id) {
  const conf = await Swal.fire({
    title: "Désactiver ce gabarit ?",
    text: "Il ne sera plus proposé, mais les règlements passés restent lisibles.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    confirmButtonText: "Désactiver",
    cancelButtonText: "Annuler",
  });
  if (!conf.isConfirmed) return;

  await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/delete-payment-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  fetchPaymentTemplates();
}

// --- Manipulation des colonnes (redessine la seule table concernée) ---

function rafraichirColonnes() {
  const tbody = document.getElementById("tpl-colonnes");
  if (tbody) tbody.innerHTML = rendreLignesColonnes();
}

export function ajouterColonne() {
  editeur.export_config.colonnes = editeur.export_config.colonnes || [];
  editeur.export_config.colonnes.push({ entete: "", source: "reference", format: "BRUT", obligatoire: false });
  rafraichirColonnes();
}

export function majColonne(index, champ, valeur) {
  const col = editeur.export_config.colonnes[index];
  if (!col) return;
  col[champ] = valeur;
  // Changer la source bascule entre « format » et « valeur fixe » : il faut
  // redessiner la ligne pour montrer le bon champ.
  if (champ === "source") rafraichirColonnes();
}

export function deplacerColonne(index, sens) {
  const cols = editeur.export_config.colonnes;
  const cible = index + sens;
  if (cible < 0 || cible >= cols.length) return;
  [cols[index], cols[cible]] = [cols[cible], cols[index]];
  rafraichirColonnes();
}

export function supprimerColonne(index) {
  editeur.export_config.colonnes.splice(index, 1);
  rafraichirColonnes();
}
