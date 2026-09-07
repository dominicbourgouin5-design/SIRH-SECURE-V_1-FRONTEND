
//Code complet de modules/hr.js

import { AppState } from "../core/state.js";
import {
  SIRH_CONFIG,
  URL_READ,
  URL_WRITE_POST,
  URL_UPDATE,
  URL_EMPLOYEE_UPDATE,
  URL_CONTRACT_GENERATE,
  URL_UPLOAD_SIGNED_CONTRACT,
  URL_BADGE_GEN,
  URL_READ_CANDIDATES,
  URL_CANDIDATE_ACTION,
  ITEMS_PER_PAGE,
  AIRTABLE_FORM_PUBLIC_LINK, 
  AIRTABLE_FORM_EDIT_LINK 
} from "../core/config.js";
import { secureFetch } from "../core/api.js";
import {
  escapeHTML,
  convertToInputDate,
  parseDateSmart,
  formatGoogleLink,
  getDriveId,
  compressImage,
  PremiumUI,
} from "../core/utils.js";

export async function fetchData(forceUpdate = false, page = 1) {
  console.log(`🚀 fetchData lancée. Page: ${page}, Role: ${AppState.currentUser?.role}`);

  const CACHE_KEY = "sirh_data_v1";
  const limit = 10;

  if (forceUpdate) {
    localStorage.removeItem(CACHE_KEY);
  }

  const filters = typeof AppState.activeFilters !== "undefined" ? AppState.activeFilters : {
    search: "",
    status: "all",
    type: "all",
    dept: "all",
  };

  let fetchUrl = `${URL_READ}?page=${page}&limit=${limit}` +
    `&search=${encodeURIComponent(filters.search || "")}` +
    `&status=${filters.status || "all"}` +
    `&type=${filters.type || "all"}` +
    `&dept=${filters.dept || "all"}` +
    `&role=${filters.role || "all"}` +
    `&agent=${encodeURIComponent(AppState.currentUser?.nom || "")}`;

  if (!AppState.currentUser?.permissions?.can_see_employees) {
    fetchUrl += `&target_id=${encodeURIComponent(AppState.currentUser?.id || "")}`;
  }

  try {
    console.log("📞 Appel API vers :", fetchUrl);

    const r = await secureFetch(fetchUrl);
    const result = await r.json();

    const d = result.data || [];
    const meta = result.meta || { total: d.length, page: 1, last_page: 1 };

    console.log(`✅ Page ${meta.page} reçue :`, d.length, "enregistrements trouvés");

    AppState.employees = d.map((x) => {
      return {
        id: x.id,
        nom: x.nom,
        date: x.date_embauche,
        employee_type: x.employee_type || "OFFICE",
        secteur: x.secteur || "GENERAL",
        perimetre_lieux: x.perimetre_lieux || "UN_LIEU",
        contenu_pointage: x.contenu_pointage || "MINIMAL",
        rythme: x.rythme || "STANDARD",
        mode_paiement_defaut: x.mode_paiement_defaut || "ESPECES",
        iban: x.iban || "",
        banque_nom: x.banque_nom || "",
        banque_code: x.banque_code || "",
        banque_guichet: x.banque_guichet || "",
        bic: x.bic || "",
        momo_numero: x.momo_numero || "",
        momo_operateur: x.momo_operateur || "",
        titulaire_compte: x.titulaire_compte || "",
        poste: x.poste,
        dept: x.departement || "Non défini",
        Solde_Conges: parseFloat(x.solde_conges) || 0,
        limit: x.type_contrat === "CDI" ? "365" : x.type_contrat === "CDD" ? "180" : "90",
        photo: x.photo_url || "",
        statut: x.statut || "Actif",
        email: x.email,
        telephone: x.telephone,
        adresse: x.adresse,
        date_naissance: x.date_naissance,
        role: x.role || "EMPLOYEE",
        manager_id: x.manager_id || "",
        scope: x.management_scope || [],
        matricule: x.matricule || "N/A",
        doc: x.contrat_pdf_url || "",
        cv_link: x.cv_url || "",
        id_card_link: x.id_card_url || "",
        diploma_link: x.diploma_url || "",
        attestation_link: x.attestation_url || "",
        lm_link: x.lm_url || "",
        salaire_base_fixe: parseFloat(x.salaire_brut_fixe) || 0,
        indemnite_transport: parseFloat(x.indemnite_transport) || 0,
        indemnite_logement: parseFloat(x.indemnite_logement) || 0,
        contract_status: x.contract_status || "Non signé",
      };
    });

    // Sauvegarde en cache local
    cacheEmployeesLocally(AppState.employees);
    cacheEmployeesMeta(meta);

    localStorage.setItem(CACHE_KEY, JSON.stringify(AppState.employees));
    localStorage.setItem(CACHE_KEY + "_time", Date.now());

    renderData();

    const paginationFooter = document.getElementById("employee-pagination-footer");
    if (paginationFooter) {
      if (meta.last_page > 1) {
        paginationFooter.innerHTML = `
          <button onclick="window.fetchData(true, ${meta.page - 1})" ${meta.page <= 1 ? "disabled" : ""} 
            class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
            <i class="fa-solid fa-chevron-left"></i> Précédent
          </button>
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            PAGE ${meta.page} / ${meta.last_page}
          </span>
          <button onclick="window.fetchData(true, ${meta.page + 1})" ${meta.page >= meta.last_page ? "disabled" : ""} 
            class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
            Suivant <i class="fa-solid fa-chevron-right"></i>
          </button>
        `;
      } else {
        paginationFooter.innerHTML = `<span class="text-[10px] font-black text-slate-300 uppercase tracking-widest">Fin de liste</span>`;
      }
    }

    if (typeof window.renderCharts === "function") window.renderCharts();
    if (AppState.currentUser?.permissions?.can_see_employees && typeof window.fetchLeaveRequests === "function") {
      window.fetchLeaveRequests();
    }
    
  } catch (e) {
    console.error("❌ ERREUR FETCH:", e);
    
    const cachedEmployees = getCachedEmployees();
    if (cachedEmployees && cachedEmployees.length > 0) {
      console.log("📡 Mode hors-ligne : utilisation du cache local");
      AppState.employees = cachedEmployees;
      renderData();
      loadMyProfile();
      return;
    }
    
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      AppState.employees = JSON.parse(cached);
      renderData();
      loadMyProfile();
    } else {
      window.Swal.fire("Erreur Connexion", "Impossible de charger vos informations.", "error");
    }
  }
}

export function changePage(direction) {
  const totalPages = Math.ceil((AppState.employees?.length || 0) / ITEMS_PER_PAGE) || 1;
  const newPage = AppState.currentPage + direction;
  if (newPage >= 1 && newPage <= totalPages) {
    AppState.currentPage = newPage;
    renderData();
  }
}

export function renderData() {
  const b = document.getElementById("full-body");
  const d = document.getElementById("dashboard-body");
  if (!b || !d) return;

  if (!AppState || !AppState.employees) {
    console.warn("AppState.employees n'est pas encore disponible");
    return;
  }

  const canManage = AppState.currentUser?.permissions?.can_see_employees === true;

  const headerAction = document.querySelector('th[data-perm="can_see_employees"]');
  if (headerAction) {
    headerAction.style.display = canManage ? "" : "none";
  }

  b.innerHTML = "";
  d.innerHTML = "";

  let total = 0,
    alertes = 0,
    actifs = 0;

  AppState.employees.forEach((e) => {
    total++;
    const rawStatus = (e.statut || "Actif").toLowerCase().trim();
    const isSortie = rawStatus.includes("sortie");

    if (rawStatus === "actif") actifs++;

    if (e.date && !isSortie) {
      let sD = parseDateSmart(e.date);
      let eD = new Date(sD);
      eD.setDate(eD.getDate() + (parseInt(e.limit) || 365));
      let dL = Math.ceil((eD - new Date()) / 86400000);

      let isExpired = dL < 0;
      let isUrgent = dL <= 15;

      if (isExpired || isUrgent) {
        alertes++;
        const manageBtn = canManage
          ? `<button class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold" onclick="window.openEditModal('${escapeHTML(e.id)}')">GÉRER</button>`
          : "";

        d.innerHTML += `
          <tr class="bg-white border-b">
              <td class="p-4 text-sm font-bold text-slate-700">${escapeHTML(e.nom)}</td>
              <td class="p-4 text-xs text-slate-500">${escapeHTML(e.poste)}</td>
              <td class="p-4 ${isExpired ? "text-red-600" : "text-orange-600"} font-bold text-xs uppercase">${isExpired ? "Expiré" : dL + " j"}</td>
              <td class="p-4 text-right">${manageBtn}</td>
          </tr>`;
      }
    }
  });

  let filteredEmployees = AppState.employees;
  if (AppState.currentFilter && AppState.currentFilter !== "all") {
    filteredEmployees = AppState.employees.filter((e) => {
      const search = AppState.currentFilter.toLowerCase();
      const eStatut = (e.statut || "").toLowerCase();
      const eDept = (e.dept || "").toLowerCase();

      if (search === "actifs" || search === "actif") {
        return eStatut === "actif" || eStatut === "en poste";
      }
      return eStatut.includes(search) || eDept.includes(search);
    });
  }

  const startIndex = (AppState.currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEmployees = filteredEmployees.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  paginatedEmployees.forEach((e) => {
    const rawStatus = (e.statut || "Actif").toLowerCase().trim();
    const isSortie = rawStatus.includes("sortie");
    const isConges = rawStatus.includes("cong");

    let bdgClass = isSortie
      ? "bg-slate-100 text-slate-500"
      : isConges
        ? "bg-blue-100 text-blue-700"
        : "bg-green-100 text-green-700";
    let bdgLabel = isSortie
      ? "SORTIE"
      : isConges
        ? "CONGÉ"
        : e.statut || "Actif";

    const av =
      e.photo && e.photo.length > 10
        ? `<img src="${formatGoogleLink(e.photo)}" loading="lazy" class="w-10 h-10 rounded-full object-cover bg-slate-200 border border-slate-200">`
        : `<div class="w-10 h-10 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center text-xs font-black text-slate-500">${escapeHTML(e.nom || "").substring(0, 2).toUpperCase()}</div>`;

    let actionCell = "";
    const perms = AppState.currentUser?.permissions || {};
    const safeId = escapeHTML(e.id);

    actionCell = `<td class="px-8 py-4 text-right"><div class="flex items-center justify-end gap-2">`;

    if (perms.can_view_employee_files) {
      actionCell += `<button onclick="window.openFullFolder('${safeId}')" title="Dossier" class="p-2 bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-500 hover:text-white transition-all"><i class="fa-solid fa-folder-open"></i></button>`;
    }

    if (perms.can_manage_contracts) {
      const isSigned = String(e.contract_status || "").toLowerCase().trim() === "signé";
      actionCell += `<div class="h-4 w-[1px] bg-slate-200 mx-1"></div>`;

      if (!isSigned) {
        actionCell += `
          <button onclick="window.generateDraftContract('${safeId}')" title="Brouillon" class="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"><i class="fa-solid fa-file-contract"></i></button>                    
          <button onclick="window.openContractModal('${safeId}')" title="Signer" class="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><i class="fa-solid fa-pen-nib"></i></button>
          <button onclick="window.triggerManualContractUpload('${safeId}')" title="Scan" class="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"><i class="fa-solid fa-file-arrow-up"></i></button>
        `;
      } else {
        actionCell += `<span class="text-[10px] font-black text-emerald-500 uppercase bg-emerald-50 px-2 py-1 rounded">Signé</span>`;
      }
    }

    if (perms.can_print_badges) {
      actionCell += `<div class="h-4 w-[1px] bg-slate-200 mx-1"></div>`;
      actionCell += `<button onclick="window.printBadge('${safeId}')" class="text-slate-400 hover:text-blue-600 transition-all"><i class="fa-solid fa-print"></i></button>`;
    }

    if (perms.can_edit_employee_basic || perms.can_manage_contracts) {
      actionCell += `<button onclick="window.openEditModal('${safeId}')" class="text-slate-400 hover:text-slate-800 transition-all"><i class="fa-solid fa-pen"></i></button>`;
    }

    if (perms.can_delete_employees) {
      actionCell += `<button onclick="window.deleteEmployee('${safeId}')" class="p-2 text-red-200 hover:text-red-600 transition-colors ml-1" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>`;
    }

    actionCell += `</div></td>`;

    b.innerHTML += `
      <tr class="border-b hover:bg-slate-50 transition-colors">
          <td class="p-4 flex gap-3 items-center min-w-[200px]">
              ${av}
              <div>
                  <div class="font-bold text-sm text-slate-800 uppercase">${escapeHTML(e.nom)}</div>
                  <div class="text-[10px] text-slate-400 font-mono">${e.matricule}</div>
              </div>
          </td>
          <td class="p-4 text-xs font-medium text-slate-500">${escapeHTML(e.poste)}</td>
          <td class="p-4"><span class="px-3 py-1 border rounded-lg text-[10px] font-black uppercase ${bdgClass}">${escapeHTML(bdgLabel)}</span></td>
          ${actionCell} 
      </tr>`;
  });

  const statTotal = document.getElementById("stat-total");
  if (statTotal) statTotal.innerText = total;
  const statAlert = document.getElementById("stat-alert");
  if (statAlert) statAlert.innerText = alertes;
  const statActive = document.getElementById("stat-active");
  if (statActive) statActive.innerText = actifs;

  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE) || 1;
  document.querySelectorAll(".page-info-global").forEach((el) => {
    el.innerText = `PAGE ${AppState.currentPage} / ${totalPages}`;
  });
}

export function filterTable() {
  const input = document.getElementById("search-input");
  if (!input) return;

  clearTimeout(AppState.searchTimeout);
  AppState.searchTimeout = setTimeout(() => {
    if (!AppState.activeFilters) AppState.activeFilters = {};
    AppState.activeFilters.search = input.value.trim();
    fetchData(true, 1);
  }, 300);
}

export function setEmployeeFilter(category, value) {
  if (!AppState.activeFilters) AppState.activeFilters = {};
  AppState.activeFilters[category] = value;

  const container = document.getElementById(`filter-group-${category}`);
  if (container) {
    container.querySelectorAll(".filter-chip").forEach((btn) => {
      if (btn.getAttribute("data-value") === value) {
        btn.className =
          "filter-chip px-3 py-1.5 rounded-lg text-[10px] font-black border bg-blue-600 text-white border-blue-600 shadow-md transition-all";
      } else {
        btn.className =
          "filter-chip px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-white text-slate-600 border-slate-200 hover:border-blue-300 transition-all";
      }
    });
  }

  fetchData(true, 1);
}

export function applySmartFilter(filterType) {
  AppState.currentStatusFilter = filterType;

  document.querySelectorAll(".filter-chip").forEach((btn) => {
    const isThisOne =
      btn.innerText.toLowerCase() === filterType.toLowerCase() ||
      (filterType === "all" && btn.innerText.toLowerCase() === "tous");

    if (isThisOne) {
      btn.classList.add("bg-blue-600", "text-white", "border-blue-600", "shadow-md");
      btn.classList.remove("bg-white", "text-slate-600");
    } else {
      btn.classList.remove("bg-blue-600", "text-white", "border-blue-600", "shadow-md");
      btn.classList.add("bg-white", "text-slate-600");
    }
  });

  fetchData(true, 1);
}

export async function populateManagerSelects() {
  const createSelect = document.getElementById("f-manager");
  const editSelect = document.getElementById("edit-manager");
  if (!createSelect && !editSelect) return;

  try {
    const response = await secureFetch(
      `${URL_READ}?limit=1000&status=Actif&agent=${encodeURIComponent(AppState.currentUser?.nom || "")}`,
    );
    const result = await response.json();
    const allActive = result.data || [];

    const optionsHtml = allActive
      .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""))
      .map(
        (e) => `<option value="${e.id}">${e.nom} (${e.poste || "Sans poste"})</option>`,
      )
      .join("");

    const defaultOpt = `<option value="">-- Aucun / Autonome --</option>`;

    if (createSelect) createSelect.innerHTML = defaultOpt + optionsHtml;
    if (editSelect) editSelect.innerHTML = defaultOpt + optionsHtml;
  } catch (e) {
    console.error("Erreur lors du chargement de la liste des responsables", e);
  }
}

export async function syncAllRoleSelects() {
  try {
    let roles;
    const cached = sessionStorage.getItem("sirh_cache_roles");

    if (cached) {
      roles = JSON.parse(cached);
    } else {
      const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-roles`);
      roles = await response.json();
      sessionStorage.setItem("sirh_cache_roles", JSON.stringify(roles));
    }

    AppState.activeRolesList = roles;
    const optionsHtml = roles
      .map((r) => `<option value="${r.role_name}">${r.role_name}</option>`)
      .join("");

    ["f-role", "edit-role"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">-- Sélectionner un rôle --</option>` + optionsHtml;
    });

    ["filter-role-select", "filter-accounting-role"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="all">Tous les rôles</option>` + optionsHtml;
    });
  } catch (e) {
    console.error("Erreur synchro rôles", e);
  }
}

export async function fetchContractTemplatesForSelection() {
  const selectElement = document.getElementById("f-contract-template-selector");
  if (!selectElement) return;

  try {
    const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-templates`);
    const templates = await response.json();

    let optionsHtml = '<option value="">-- Choisir un modèle --</option>';
    templates.forEach((tpl) => {
      optionsHtml += `<option value="${tpl.id}">${tpl.label}</option>`;
    });
    selectElement.innerHTML = optionsHtml;
  } catch (e) {
    console.error("Erreur chargement modèles de contrat pour sélection", e);
    selectElement.innerHTML = '<option value="">Erreur de chargement</option>';
  }
}

export async function fetchAndPopulateDepartments() {
  try {
    let depts;
    const cached = sessionStorage.getItem("sirh_cache_depts");

    if (cached) {
      depts = JSON.parse(cached);
    } else {
      const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-departments`);
      depts = await response.json();
      sessionStorage.setItem("sirh_cache_depts", JSON.stringify(depts));
    }

    const defaultOpt = `<option value="">-- Choisir un département --</option>`;
    const optionsHtml = depts
      .map((d) => `<option value="${d.code}">${d.label}</option>`)
      .join("");

    const acctDept = document.getElementById("filter-accounting-dept");
    if (acctDept) acctDept.innerHTML = `<option value="all">Tous les Départements</option>` + optionsHtml;

    ["f-dept", "edit-dept"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = defaultOpt + optionsHtml;
    });
  } catch (e) {
    console.error("Erreur chargement départements", e);
  }
}

export async function loadMyProfile() {
  if (!AppState.currentUser || !AppState.currentUser.id) {
    console.error("❌ Pas d'utilisateur connecté.");
    Swal.fire("Erreur", "Session expirée. Veuillez vous reconnecter.", "error");
    return;
  }

  const resetText = (id) => { 
    const el = document.getElementById(id);
    if (el) el.innerText = "..."; 
  };
  ["emp-name", "emp-job", "user-stat-hours", "user-stat-primes", "leave-balance-display"].forEach(resetText);

  const photoEl = document.getElementById("emp-photo-real");
  const avatarEl = document.getElementById("emp-avatar");
  if (photoEl) photoEl.classList.add("hidden");
  if (avatarEl) {
    avatarEl.classList.remove("hidden");
    avatarEl.innerText = (AppState.currentUser.nom || "U").charAt(0).toUpperCase();
  }
  
  if (document.getElementById("emp-start-date")) document.getElementById("emp-start-date").innerText = "--/--/----";
  if (document.getElementById("emp-end-date")) document.getElementById("emp-end-date").innerText = "--/--/----";

  try {
    const userId = AppState.currentUser.id;

    const [profileRes, statsRes] = await Promise.all([
      secureFetch(`${URL_READ}?target_id=${encodeURIComponent(userId)}&agent=${encodeURIComponent(AppState.currentUser.nom || "")}`),
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/read-report?mode=PERSONAL&period=monthly&requester_id=${userId}`)
    ]);

    const result = await profileRes.json();
    const statsData = await statsRes.json();
    const myRawData = result.data?.[0];

    if (!myRawData) {
      Swal.fire("Erreur", "Votre fiche employé est introuvable.", "error");
      return;
    }

    const myData = {
      id: myRawData.id,
      nom: myRawData.nom,
      date: myRawData.date_embauche,
      employee_type: myRawData.employee_type || "OFFICE",
      contenu_pointage: myRawData.contenu_pointage || "MINIMAL",
      poste: myRawData.poste,
      dept: myRawData.departement || "Non défini",
      solde_conges: parseFloat(myRawData.solde_conges) || 0,
      limit: myRawData.type_contrat === "CDI" ? "365" : myRawData.type_contrat === "CDD" ? "180" : "90",
      photo: myRawData.photo_url || "",
      email: myRawData.email,
      telephone: myRawData.telephone,
      adresse: myRawData.adresse,
      date_naissance: myRawData.date_naissance,
      role: myRawData.role || "EMPLOYEE",
      matricule: myRawData.matricule || "N/A",
      doc: myRawData.contrat_pdf_url || "",
      cv_link: myRawData.cv_url || "",
      id_card_link: myRawData.id_card_url || "",
      diploma_link: myRawData.diploma_url || "",
      attestation_link: myRawData.attestation_url || "",
      lm_link: myRawData.lm_url || "",
      contract_status: myRawData.contract_status || "Non signé",
    };

    if (statsData && statsData.length > 0) {
      const currentStats = statsData[0]; 
      if (document.getElementById('user-stat-hours')) {
        document.getElementById('user-stat-hours').innerText = currentStats.heures || "0h 00m";
      }
      if (document.getElementById('user-stat-primes')) {
        const nbJours = parseInt(currentStats.jours) || 0;
        document.getElementById('user-stat-primes').innerText = new Intl.NumberFormat('fr-FR').format(nbJours * 500);
      }
    }

    const leaveBalanceEl = document.getElementById("leave-balance-display");
    if (leaveBalanceEl) {
      leaveBalanceEl.innerText = `${myData.solde_conges} jours`;
      leaveBalanceEl.className = myData.solde_conges <= 5 ? "text-3xl font-black mt-2 text-orange-600" : "text-3xl font-black mt-2 text-indigo-600";
    }

    const empName = document.getElementById("emp-name");
    if (empName) empName.innerText = myData.nom;
    const empJob = document.getElementById("emp-job");
    if (empJob) empJob.innerText = myData.poste;

    if (myData.photo && myData.photo.length > 10 && photoEl) {
      photoEl.src = formatGoogleLink(myData.photo);
      photoEl.classList.remove("hidden");
      if (avatarEl) avatarEl.classList.add("hidden");
    }

    if (myData.date) {
      let sD = parseDateSmart(myData.date);
      const empStart = document.getElementById("emp-start-date");
      if (empStart) empStart.innerText = sD.toLocaleDateString("fr-FR");
      let eD = new Date(sD);
      eD.setDate(eD.getDate() + (parseInt(myData.limit) || 365));
      const empEnd = document.getElementById("emp-end-date");
      if (empEnd) empEnd.innerText = eD.toLocaleDateString("fr-FR");
    }

    const setInputVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };

    setInputVal("emp-email", myData.email);
    setInputVal("emp-phone", myData.telephone);
    setInputVal("emp-address", myData.adresse);
    setInputVal("emp-dob", convertToInputDate(myData.date_naissance));

    const dC = document.getElementById("doc-container");
    if (dC) {
      dC.innerHTML = "";
      const allDocs = [
        { label: `Document Engagement`, link: myData.doc, icon: "fa-file-signature", color: "blue", key: "contrat" },
        { label: "Curriculum Vitae", link: myData.cv_link, icon: "fa-file-pdf", color: "indigo", key: "cv" },
        { label: "Lettre Motivation", link: myData.lm_link, icon: "fa-envelope-open-text", color: "pink", key: "lm" },
        { label: "Pièce d'Identité", link: myData.id_card_link, icon: "fa-id-card", color: "slate", key: "id_card" },
        { label: "Diplômes/Certifs", link: myData.diploma_link, icon: "fa-graduation-cap", color: "emerald", key: "diploma" },
        { label: "Attestations", link: myData.attestation_link, icon: "fa-file-invoice", color: "orange", key: "attestation" },
      ];

      let gridHtml = '<div class="grid grid-cols-1 md:grid-cols-4 gap-4">';
      allDocs.forEach((doc) => {
        const hasLink = doc.link && doc.link.length > 5;
        const safeLabel = doc.label.replace(/'/g, "\\'");
        const canEdit = AppState.currentUser?.role === "ADMIN" || AppState.currentUser?.role === "RH";

        gridHtml += `
          <div class="flex flex-col justify-between p-4 border border-slate-100 bg-white rounded-2xl hover:shadow-md transition-all group h-full">
              <div class="flex items-center gap-3 mb-4">
                  <div class="bg-${doc.color}-50 text-${doc.color}-600 p-3 rounded-xl shrink-0"><i class="fa-solid ${doc.icon} text-lg"></i></div>
                  <div class="overflow-hidden">
                      <p class="text-xs font-bold text-slate-700 truncate">${doc.label}</p>
                      <p class="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Document</p>
                  </div>
              </div>
              <div class="flex gap-2 mt-auto">
                  ${hasLink ? `<button onclick="viewDocumentHistory('${myData.id}', '${doc.key}', '${safeLabel}')" class="p-2 text-indigo-400 hover:bg-indigo-50 rounded-lg" title="Historique"><i class="fa-solid fa-clock-rotate-left"></i></button>` : ""}
                  ${hasLink ? `<button onclick="window.viewDocument('${doc.link}', '${safeLabel}')" class="flex-1 py-2 text-[10px] font-bold uppercase bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all">Voir</button>` : `<div class="flex-1 py-2 text-[10px] font-bold uppercase bg-slate-50 text-slate-300 rounded-lg text-center cursor-not-allowed">Vide</div>`}
                  ${canEdit ? `<button onclick="updateSingleDoc('${doc.key}', '${myData.id}')" class="w-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-800 hover:text-white transition-all"><i class="fa-solid fa-pen"></i></button>` : ""}
              </div>
          </div>`;
      });
      gridHtml += "</div>";
      dC.innerHTML = gridHtml;
    }

    const bulkBtn = document.getElementById("btn-bulk-archive");
    if (bulkBtn) bulkBtn.setAttribute("onclick", `window.openBulkArchiveModal('${myData.id}')`);

    const exportBtn = document.getElementById("btn-export-zip");
    if (exportBtn) exportBtn.setAttribute("onclick", `window.downloadEmployeeZip('${myData.id}', '${myData.nom.replace(/'/g, "\\'")}')`);

    const mobileSection = document.getElementById("mobile-recap-section");
    if (myData.contenu_pointage === "COMPLET") {
      if (mobileSection) mobileSection.classList.remove("hidden");
      if (typeof fetchMyActivityRecap === "function") fetchMyActivityRecap();
    } else {
      if (mobileSection) mobileSection.classList.add("hidden");
    }

  } catch (e) {
    console.error("Erreur de chargement du profil personnel:", e);
    Swal.fire("Erreur", "Impossible de charger votre profil complet.", "error");
  }
}

export async function saveMyProfile() {
  Swal.fire({ title: "Sauvegarde...", didOpen: () => Swal.showLoading() });

  const idToSend = AppState.currentUser?.id;
  if (!idToSend) {
    return Swal.fire("Erreur", "Identifiant session introuvable.", "error");
  }

  const fd = new FormData();
  fd.append("id", idToSend); 
  fd.append("email", document.getElementById("emp-email")?.value || "");
  fd.append("phone", document.getElementById("emp-phone")?.value || "");
  fd.append("address", document.getElementById("emp-address")?.value || "");
  fd.append("dob", document.getElementById("emp-dob")?.value || "");
  fd.append("agent", AppState.currentUser?.nom || "");
  fd.append("agent_role", AppState.currentUser?.role || ""); 
  fd.append("doc_type", "text_update"); 

  const photoInput = document.getElementById("emp-upload-photo");
  if (photoInput && photoInput.files[0]) {
    fd.append("new_photo", photoInput.files[0]);
  } else if (AppState.capturedBlob) {
    fd.append("new_photo", AppState.capturedBlob, "photo_profil.jpg");
  }

  try {
    const response = await secureFetch(URL_EMPLOYEE_UPDATE, {
      method: "POST",
      body: fd,
    });

    if (response.ok) {
      Swal.fire("Succès", "Votre profil a été mis à jour", "success");
      toggleEditMode();
      fetchData(true);
    } else {
      throw new Error("Erreur serveur (" + response.status + ")");
    }
  } catch (e) {
    Swal.fire("Erreur", "Échec de l'enregistrement : " + e.message, "error");
  }
}

export function toggleEditMode() {
  const ids = ["emp-email", "emp-phone", "emp-address", "emp-dob"];
  const btn = document.getElementById("save-btn-container");
  const emailEl = document.getElementById("emp-email");
  if (!emailEl) return;

  const dis = emailEl.disabled;
  ids.forEach((i) => {
    const el = document.getElementById(i);
    if (el) {
      el.disabled = !dis;
      if (!dis) el.classList.add("bg-white", "ring-2", "ring-blue-100");
      else el.classList.remove("bg-white", "ring-2", "ring-blue-100");
    }
  });

  if (dis) {
    if (btn) btn.classList.remove("hidden");
    emailEl.focus();
  } else {
    if (btn) btn.classList.add("hidden");
    loadMyProfile();
  }
}

export function triggerPhotoUpload() {
  const upload = document.getElementById("emp-upload-photo");
  if (upload) upload.click();
}

export function previewPhoto(e) {
  const f = e.target.files[0];
  if (f) {
    const r = new FileReader();
    r.onload = function (ev) {
      const real = document.getElementById("emp-photo-real");
      const avatar = document.getElementById("emp-avatar");
      const saveBtn = document.getElementById("save-btn-container");
      if (real) {
        real.src = ev.target.result;
        real.classList.remove("hidden");
      }
      if (avatar) avatar.classList.add("hidden");
      if (saveBtn) saveBtn.classList.remove("hidden");
    };
    r.readAsDataURL(f);
  }
}

export function openFullFolder(id) {
  const e = AppState.employees.find((x) => String(x.id) === String(id));
  if (!e) return;

  const setElemText = (elId, val) => {
    const el = document.getElementById(elId);
    if (el) el.innerText = val || "";
  };

  const folderPhoto = document.getElementById("folder-photo");
  if (folderPhoto) folderPhoto.src = formatGoogleLink(e.photo) || "https://via.placeholder.com/150";

  setElemText("folder-name", e.nom);
  setElemText("folder-id", "MATRICULE : " + e.matricule);
  setElemText("folder-poste", e.poste);
  setElemText("folder-dept", e.dept);
  setElemText("folder-email", e.email || "Non renseigné");
  setElemText("folder-phone", e.telephone || "Non renseigné");
  setElemText("folder-address", e.adresse || "Non renseignée");

  if (e.date) {
    let sD = parseDateSmart(e.date);
    setElemText("folder-start", sD.toLocaleDateString("fr-FR"));
    let eD = new Date(sD);
    eD.setDate(eD.getDate() + (parseInt(e.limit) || 365));
    setElemText("folder-end", eD.toLocaleDateString("fr-FR"));
  }

  const deptEl = document.getElementById("folder-dept");
  if (deptEl && deptEl.parentElement && deptEl.parentElement.parentElement) {
    const infoContainer = deptEl.parentElement.parentElement;
    const existingSalary = document.getElementById("folder-salary-block");
    if (existingSalary) existingSalary.remove();

    const salaryHtml = `
      <div id="folder-salary-block" class="mt-4 pt-4 border-t border-white/10">
          <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Salaire de Base Fixe</p>
          <div class="flex items-center gap-2">
              <p class="text-sm font-black text-blue-400 sensitive-value" onclick="window.toggleSensitiveData(this)">
                  ${new Intl.NumberFormat("fr-FR").format(e.salaire_base_fixe || 0)} CFA
              </p>
              <i class="fa-solid fa-eye-slash text-[9px] text-slate-600"></i>
          </div>
      </div>`;
    infoContainer.insertAdjacentHTML("beforeend", salaryHtml);
  }

  const grid = document.getElementById("folder-docs-grid");
  if (grid) {
    grid.innerHTML = "";
    const docs = [
      { label: `Document Engagement`, link: e.doc, icon: "fa-file-signature", color: "blue", key: "contrat" },
      { label: "Curriculum Vitae", link: e.cv_link, icon: "fa-file-pdf", color: "indigo", key: "cv" },
      { label: "Lettre Motivation", link: e.lm_link, icon: "fa-envelope-open-text", color: "pink", key: "lm" },
      { label: "Pièce d'Identité", link: e.id_card_link, icon: "fa-id-card", color: "slate", key: "id_card" },
      { label: "Diplômes/Certifs", link: e.diploma_link, icon: "fa-graduation-cap", color: "emerald", key: "diploma" },
      { label: "Attestations / Autres", link: e.attestation_link, icon: "fa-file-invoice", color: "orange", key: "attestation" },
    ];

    docs.forEach((doc) => {
      const hasLink = doc.link && doc.link.length > 5;
      const safeLabel = doc.label.replace(/'/g, "\\'");
      const canEdit = ["ADMIN", "RH", "MANAGER"].includes(AppState.currentUser?.role);

      grid.innerHTML += `
        <div class="p-4 rounded-2xl border ${hasLink ? "bg-white shadow-sm border-slate-200" : "bg-slate-100 opacity-50"} flex items-center justify-between group">
            <div class="flex items-center gap-3">
                <div class="p-2.5 rounded-xl bg-${doc.color}-50 text-${doc.color}-600"><i class="fa-solid ${doc.icon}"></i></div>
                <p class="text-xs font-bold text-slate-700">${doc.label}</p>
            </div>
            <div class="flex gap-2">
                ${hasLink ? `<button onclick="viewDocumentHistory('${e.id}', '${doc.key}', '${safeLabel}')" class="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Voir l'historique"><i class="fa-solid fa-clock-rotate-left"></i></button>` : ""}
                ${hasLink ? `<button onclick="window.viewDocument('${doc.link}', '${safeLabel}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Consulter Actuel"><i class="fa-solid fa-eye"></i></button>` : ""}
                ${canEdit ? `<button onclick="updateSingleDoc('${doc.key}', '${e.id}')" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Mettre à jour"><i class="fa-solid fa-cloud-arrow-up"></i></button>` : ""}
            </div>
        </div>`;
    });
  }

  const bulkBtn = document.getElementById("btn-bulk-archive");
  if (bulkBtn) bulkBtn.setAttribute("onclick", `window.openBulkArchiveModal('${e.id}')`);

  const exportBtn = document.getElementById("btn-export-zip");
  if (exportBtn) exportBtn.setAttribute("onclick", `window.downloadEmployeeZip('${e.id}', '${escapeHTML(e.nom)}')`);

  const modal = document.getElementById("folder-modal");
  if (modal) modal.classList.remove("hidden");
}

export function closeFolderModal() {
  const modal = document.getElementById("folder-modal");
  if (modal) modal.classList.add("hidden");
}

export function toggleMoreDocs(btn) {
  document.querySelectorAll(".more-docs").forEach((el) => {
    el.classList.remove("hidden");
    el.classList.add("animate-fadeIn");
  });
  if (btn?.parentElement) btn.parentElement.remove();
}

export function openDocCamera(target) {
  Swal.fire({
    title: "Source du document",
    text: "Voulez-vous prendre une photo ou choisir un fichier ?",
    showCancelButton: true,
    confirmButtonText: "📸 Caméra",
    cancelButtonText: "📁 Fichier",
    confirmButtonColor: "#2563eb",
  }).then((result) => {
    if (result.isConfirmed) {
      startGenericCamera(target);
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      const fileInput =
        document.getElementById("f-" + target) ||
        document.getElementById("file-" + target) ||
        document.getElementById(target);
      if (fileInput) {
        fileInput.click();
      } else {
        console.warn(`Champ de fichier introuvable pour la cible : ${target}`);
      }
    }
  });
}

export async function startGenericCamera(target) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    Swal.fire({
      title: "Capture",
      html: `<video id="temp-video" autoplay playsinline class="w-full rounded-xl"></video>`,
      confirmButtonText: "CAPTURER",
      showCancelButton: true,
      didOpen: () => {
        const vid = document.getElementById("temp-video");
        if (vid) vid.srcObject = stream;
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const video = document.getElementById("temp-video");
        if (!video) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        canvas.getContext("2d").drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) saveDoc(target, blob);
            stream.getTracks().forEach((t) => t.stop());
          },
          "image/jpeg",
          0.8,
        );
      } else {
        stream.getTracks().forEach((t) => t.stop());
      }
    });
  } catch (e) {
    Swal.fire("Erreur", "Caméra inaccessible", "error");
  }
}

export function previewDocFile(event, target) {
  const file = event.target.files?.[0];
  if (file) saveDoc(target, file);
}

export async function saveDoc(target, fileOrBlob) {
  if (Swal.isVisible()) {
    Swal.update({ text: "Compression du document en cours..." });
  }
  const processedFile = await compressImage(fileOrBlob);
  if (!AppState.docBlobs) AppState.docBlobs = {};
  AppState.docBlobs[target] = processedFile;

  const preview = document.getElementById("preview-" + target);
  const icon = document.getElementById("icon-" + target);

  if (preview) {
    preview.src = URL.createObjectURL(processedFile);
    preview.classList.remove("hidden");
    if (icon) icon.classList.add("hidden");
  } else if (target === "leave_justif") {
    const previewEl = document.getElementById("leave-doc-preview");
    if (previewEl) previewEl.innerHTML = '<i class="fa-solid fa-check text-emerald-500"></i>';
  }
}

export async function updateSingleDoc(docKey, employeeId) {
  const { value: file } = await Swal.fire({
    title: "Mettre à jour le document",
    input: "file",
    inputAttributes: { accept: "image/*,application/pdf" },
    showCancelButton: true,
    confirmButtonText: "Uploader",
    cancelButtonColor: "#ef4444",
    confirmButtonColor: "#2563eb",
  });

  if (file) {
    Swal.fire({
      title: "Envoi...",
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false,
    });
    const fd = new FormData();
    fd.append("id", employeeId);
    fd.append("agent", AppState.currentUser?.nom || "");
    fd.append("agent_role", AppState.currentUser?.role || "");

    if (Swal.isVisible()) {
      Swal.update({ text: "Compression du document en cours..." });
    }
    const compressedFile = await compressImage(file);
    fd.append("new_photo", compressedFile);
    fd.append("doc_type", docKey);

    try {
      const r = await secureFetch(URL_EMPLOYEE_UPDATE, {
        method: "POST",
        body: fd,
      });
      if (r.ok) {
        Swal.fire("Succès", "Document mis à jour", "success");
        if (typeof window.refreshAllData === "function") window.refreshAllData();
      }
    } catch (e) {
      Swal.fire("Erreur", e.message, "error");
    }
  }
}

export function updateFileFeedback(inputId, labelId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  const file = input?.files?.[0];

  if (file && label) {
    if (!label.dataset.originalText) label.dataset.originalText = label.innerHTML;
    label.innerHTML = `<i class="fa-solid fa-check-circle text-emerald-500 mr-2"></i> <span class="text-emerald-700 font-bold text-[10px] truncate">${file.name}</span>`;
    label.classList.add("bg-emerald-50", "border-emerald-200");
    label.classList.remove("bg-white", "bg-blue-50", "text-slate-600", "text-blue-600");
  }
}

export async function handleOnboarding(e) {
  e.preventDefault();
  console.log("Tentative de création de profil...");
  const fd = new FormData();

  try {
    const getVal = (id) => {
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`Attention: L'élément avec l'ID "${id}" est introuvable dans le DOM.`);
        return "";
      }
      return el.value !== undefined && el.value !== null ? el.value : "";
    };

    // Champs généraux et hiérarchiques sécurisés
    fd.append("manager_id", getVal("f-manager"));
    const scopeVal = getVal("f-scope");
    fd.append(
      "scope",
      scopeVal ? JSON.stringify(scopeVal.split(",").map((s) => s.trim())) : "[]",
    );

    fd.append("nom", getVal("f-nom"));
    fd.append("email", getVal("f-email"));
    fd.append("telephone", getVal("f-phone"));
    fd.append("dob", getVal("f-dob"));
    fd.append("adresse", getVal("f-address"));
    fd.append("date", getVal("f-date")); // date_embauche
    fd.append("poste", getVal("f-poste"));
    fd.append("dept", getVal("f-dept"));
    fd.append("employee_type", getVal("f-type"));
    fd.append("secteur", getVal("f-secteur"));
    fd.append("perimetre_lieux", getVal("f-perimetre-lieux"));
    fd.append("contenu_pointage", getVal("f-contenu-pointage"));
    fd.append("rythme", getVal("f-rythme"));

    // Coordonnées de paiement
    if (window.collectPaymentFields) {
      const paiement = window.collectPaymentFields("f");
      if (paiement && paiement.erreurs && paiement.erreurs.length > 0) {
        Swal.fire("Coordonnées de paiement", paiement.erreurs.join("\n"), "warning");
        return;
      }
      if (paiement && paiement.valeurs) {
        Object.entries(paiement.valeurs).forEach(([cle, val]) => {
          fd.append(cle, val === null ? "" : val);
        });
      }
    }

    fd.append("limit", getVal("f-limit")); // type_contrat
    fd.append("role", getVal("f-role"));

    // Champs contractuels
    fd.append("salaire_brut_fixe", getVal("f-salaire-fixe"));
    fd.append("indemnite_transport", getVal("f-indemnite-transport"));
    fd.append("indemnite_logement", getVal("f-indemnite-logement"));
    fd.append("temps_travail", getVal("f-temps-travail"));
    fd.append("lieu_naissance", getVal("f-lieu-naissance"));
    fd.append("nationalite", getVal("f-nationalite"));
    fd.append("contract_template_id", getVal("f-contract-template-selector"));
    fd.append("civilite", getVal("f-civilite"));
    fd.append("duree_essai", getVal("f-duree-essai"));
    fd.append("lieu_signature", getVal("f-lieu-signature"));
    fd.append("agent", AppState.currentUser ? AppState.currentUser.nom : "Système");

    // Photo de profil
    if (AppState.capturedBlob) {
      const compressedProfilePhoto = await compressImage(AppState.capturedBlob);
      fd.append("photo", compressedProfilePhoto, "photo_profil.jpg");
    }

    // Documents KYC (optionnels)
    if (AppState.docBlobs?.id_card)
      fd.append("id_card", AppState.docBlobs.id_card, "piece_identite.jpg");
    if (AppState.docBlobs?.cv)
      fd.append("cv", AppState.docBlobs.cv, "cv.jpg");
    if (AppState.docBlobs?.diploma)
      fd.append("diploma", AppState.docBlobs.diploma, "diplome.jpg");
    if (AppState.docBlobs?.attestation)
      fd.append("attestation", AppState.docBlobs.attestation, "attestation.jpg");

    Swal.fire({
      title: "Création du dossier...",
      text: "Envoi des informations et des documents au serveur sécurisé",
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false,
    });

    const response = await secureFetch(URL_WRITE_POST, {
      method: "POST",
      body: fd,
    });

    if (response.ok) {
      await Swal.fire({
        icon: "success",
        title: "Profil créé !",
        text: "Le collaborateur a été ajouté et ses accès ont été envoyés par email.",
        confirmButtonColor: "#2563eb",
      });

      if (e.target && typeof e.target.reset === "function") {
        e.target.reset();
      }
      resetCamera();
      AppState.docBlobs = {
        id_card: null,
        cv: null,
        diploma: null,
        attestation: null,
        leave_justif: null,
      };

      const docIds = ["id_card", "cv", "diploma", "attestation"];
      docIds.forEach((id) => {
        const label = document.getElementById("btn-" + id);
        const preview = document.getElementById("preview-" + id);
        const icon = document.getElementById("icon-" + id);

        if (label) {
          label.classList.remove("bg-emerald-50", "border-emerald-200");
          label.innerHTML = label.dataset.originalText || label.innerHTML;
        }
        if (preview) preview.classList.add("hidden");
        if (icon) icon.classList.remove("hidden");
      });

      await fetchData(true);

      const targetView = document.getElementById("view-employees") ? "employees" : "AppState.employees";
      if (typeof window.switchView === "function") {
        window.switchView(targetView);
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Erreur serveur");
    }
  } catch (error) {
    console.error("Erreur lors de l'onboarding:", error);
    Swal.fire(
      "Échec",
      "Impossible de créer le profil : " + error.message,
      "error",
    );
  }
}

export function moveStep(delta) {
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  };

  if (delta > 0) {
    if (AppState.currentWizardStep === 1) {
      const nom = getVal("f-nom");
      const email = getVal("f-email");
      if (!nom || !email) {
        Swal.fire(
          "Champ manquant",
          "Le nom et l'email sont obligatoires.",
          "warning",
        );
        return;
      }
    }

    if (AppState.currentWizardStep === 2) {
      const poste = getVal("f-poste");
      const dateEmbauche = getVal("f-date");

      if (!poste || !dateEmbauche) {
        if (typeof PremiumUI !== "undefined" && PremiumUI.vibrate) PremiumUI.vibrate("error");
        Swal.fire(
          "Données du contrat",
          "Le poste et la date d'embauche sont obligatoires pour générer le contrat.",
          "warning",
        );
        return;
      }
    }
  }

  const nextStep = AppState.currentWizardStep + delta;
  if (nextStep < 1 || nextStep > 3) return;

  const curStepEl = document.getElementById(`step-${AppState.currentWizardStep}`);
  const nextStepEl = document.getElementById(`step-${nextStep}`);
  if (curStepEl) curStepEl.classList.add("hidden");
  if (nextStepEl) nextStepEl.classList.remove("hidden");

  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`step-dot-${i}`);
    if (dot) {
      dot.classList.toggle("bg-blue-600", i <= nextStep);
      dot.classList.toggle("bg-white/10", i > nextStep);
    }
  }

  const prevBtn = document.getElementById("btn-prev");
  if (prevBtn) prevBtn.style.visibility = nextStep === 1 ? "hidden" : "visible";

  const nextBtn = document.getElementById("btn-next");
  if (nextBtn) nextBtn.classList.toggle("hidden", nextStep === 3);

  const submitBtn = document.getElementById("btn-submit-wizard");
  if (submitBtn) submitBtn.classList.toggle("hidden", nextStep !== 3);

  const titles = {
    1: "Identité & Photo",
    2: "Poste & Finances",
    3: "Dossier & Hiérarchie",
  };
  const subtitle = document.getElementById("wizard-subtitle");
  if (subtitle) subtitle.innerText = `Étape ${nextStep} : ${titles[nextStep]}`;
  
  AppState.currentWizardStep = nextStep;
  
  const scrollContainer = document.getElementById("main-scroll-container");
  if (scrollContainer) scrollContainer.scrollTo(0, 0);
}

export function toggleContractFieldsVisibility() {
  const typeEl = document.getElementById("f-type");
  const selectedEmployeeType = typeEl ? typeEl.value : "";

  document.querySelectorAll(".field-group-contract[data-employee-type]").forEach((el) => {
    el.style.display = "none";
  });

  document.querySelectorAll(".field-group-contract:not([data-employee-type])").forEach((el) => {
    el.style.display = "block";
  });

  document.querySelectorAll(`.field-group-contract[data-employee-type="${selectedEmployeeType}"]`).forEach((el) => {
    el.style.display = "block";
  });
}

export async function startCameraFeed() {
  try {
    AppState.videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
    });
    const v = document.getElementById("video-stream");
    if (v) {
      v.srcObject = AppState.videoStream;
      v.classList.remove("hidden");
    }
    const capturedImg = document.getElementById("captured-image");
    if (capturedImg) capturedImg.classList.add("hidden");
    const btnCap = document.getElementById("btn-capture");
    if (btnCap) btnCap.classList.remove("hidden");
    const initControls = document.getElementById("initial-controls");
    if (initControls) initControls.classList.add("hidden");
    const placeholder = document.getElementById("photo-placeholder");
    if (placeholder) placeholder.classList.add("hidden");
  } catch (e) {
    Swal.fire("Erreur", "Caméra bloquée", "error");
  }
}

export function resetCamera() {
  const capturedImg = document.getElementById("captured-image");
  const btnRetake = document.getElementById("btn-retake");
  const btnCapture = document.getElementById("btn-capture");
  const videoStream = document.getElementById("video-stream");
  const initialControls = document.getElementById("initial-controls");
  const fileUpload = document.getElementById("file-upload");
  const photoPlaceholder = document.getElementById("photo-placeholder");

  if (capturedImg) capturedImg.classList.add("hidden");
  if (btnRetake) btnRetake.classList.add("hidden");
  if (btnCapture) btnCapture.classList.add("hidden");
  if (videoStream) videoStream.classList.add("hidden");
  if (initialControls) initialControls.classList.remove("hidden");
  if (fileUpload) fileUpload.value = "";
  if (photoPlaceholder) photoPlaceholder.classList.remove("hidden");

  AppState.capturedBlob = null;
  if (AppState.videoStream) {
    AppState.videoStream.getTracks().forEach((t) => t.stop());
    AppState.videoStream = null;
  }
}

export function takeSnapshot() {
  const v = document.getElementById("video-stream");
  const c = document.getElementById("camera-canvas");
  if (!v || !c) return;
  c.width = v.videoWidth || 640;
  c.height = v.videoHeight || 480;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(
    (b) => {
      AppState.capturedBlob = b;
      const i = document.getElementById("captured-image");
      if (i) {
        i.src = URL.createObjectURL(b);
        i.classList.remove("hidden");
      }
      v.classList.add("hidden");
      const btnCap = document.getElementById("btn-capture");
      if (btnCap) btnCap.classList.add("hidden");
      const btnRetake = document.getElementById("btn-retake");
      if (btnRetake) btnRetake.classList.remove("hidden");
      if (AppState.videoStream) {
        AppState.videoStream.getTracks().forEach((t) => t.stop());
        AppState.videoStream = null;
      }
    },
    "image/jpeg",
    0.8,
  );
}

export function handleFileUpload(e) {
  const f = e.target.files?.[0];
  if (f) {
    AppState.capturedBlob = f;
    const i = document.getElementById("captured-image");
    if (i) {
      i.src = URL.createObjectURL(f);
      i.classList.remove("hidden");
    }
    const v = document.getElementById("video-stream");
    if (v) v.classList.add("hidden");
    const initControls = document.getElementById("initial-controls");
    if (initControls) initControls.classList.add("hidden");
    const btnRetake = document.getElementById("btn-retake");
    if (btnRetake) btnRetake.classList.remove("hidden");
    const placeholder = document.getElementById("photo-placeholder");
    if (placeholder) placeholder.classList.add("hidden");
  }
}

export async function openEditModal(id) {
  const e = AppState.employees.find((x) => String(x.id) === String(id));
  if (!e) return;

  AppState.currentEditingOriginal = { ...e };

  const editModal = document.getElementById("edit-modal");
  if (editModal) editModal.classList.remove("hidden");
  const hiddenId = document.getElementById("edit-id-hidden");
  if (hiddenId) hiddenId.value = id;

  const perms = AppState.currentUser?.permissions || {};
  const blockStatus = document.getElementById("edit-block-status");
  const blockContract = document.getElementById("edit-block-contract");
  const blockHierarchy = document.getElementById("edit-block-hierarchy");

  if (blockContract)
    blockContract.style.display = perms.can_manage_contracts ? "block" : "none";
  if (blockHierarchy)
    blockHierarchy.style.display = perms.can_manage_contracts ? "block" : "none";
  if (blockStatus)
    blockStatus.style.display =
      perms.can_manage_contracts || perms.can_edit_employee_basic ? "block" : "none";

  await populateManagerSelects();

  const roleSelect = document.getElementById("edit-role");
  if (roleSelect) {
    const roles = AppState.activeRolesList || [];
    roleSelect.innerHTML =
      '<option value="">-- Sélectionner --</option>' +
      roles
        .map((r) => `<option value="${r.role_name}">${r.role_name}</option>`)
        .join("");
  }

  setTimeout(() => {
    const setVal = (fieldId, val) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = val !== undefined && val !== null ? val : "";
    };

    const mgrSelect = document.getElementById("edit-manager");
    if (mgrSelect) mgrSelect.value = e.manager_id || "";
    const scopeInput = document.getElementById("edit-scope");
    if (scopeInput) scopeInput.value = (e.scope || []).join(", ");

    setVal("edit-type", e.employee_type || "OFFICE");
    setVal("edit-secteur", e.secteur || "GENERAL");
    setVal("edit-perimetre-lieux", e.perimetre_lieux || "UN_LIEU");
    setVal("edit-contenu-pointage", e.contenu_pointage || "MINIMAL");
    setVal("edit-rythme", e.rythme || "STANDARD");
    setVal("edit-statut", e.statut || "Actif");

    if (window.renderPaymentFields) {
      window.renderPaymentFields("edit", e, { gele: !!e.coordonnees_gelees });
    }

    if (roleSelect) {
      const dbRole = String(e.role || "").trim().toUpperCase();
      let matchFound = false;
      for (let i = 0; i < roleSelect.options.length; i++) {
        if (roleSelect.options[i].value.toUpperCase() === dbRole) {
          roleSelect.selectedIndex = i;
          matchFound = true;
          break;
        }
      }
      if (!matchFound) roleSelect.value = "";
    }

    setVal("edit-dept", e.dept || "IT & Tech");
    setVal("edit-type-contrat", e.limit || "365");

    const dateInput = document.getElementById("edit-start-date");
    if (dateInput) {
      dateInput.value = e.date
        ? convertToInputDate(e.date)
        : new Date().toISOString().split("T")[0];
    }

    setVal("edit-salaire-fixe", e.salaire_base_fixe || 0);
    setVal("edit-indemnite-transport", e.indemnite_transport || 0);
    setVal("edit-indemnite-logement", e.indemnite_logement || 0);

    const initCheck = document.getElementById("edit-init-check");
    if (initCheck) initCheck.checked = false;
  }, 50);
}

export function closeEditModal() {
  const modal = document.getElementById("edit-modal");
  if (modal) modal.classList.add("hidden");
}

let permModalState = { employeeId: null, employeeName: "", rolePermissions: {}, overrides: [], changes: {} };

function humanizePermission(key) {
  return key.replace(/^can_/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export async function openPermissionsModal(employeeId, employeeRole) {
  const employeeName = AppState.currentEditingOriginal?.nom || `Employé #${employeeId}`;
  permModalState = { employeeId, employeeName, rolePermissions: {}, overrides: [], changes: {} };

  const nameEl = document.getElementById("permissions-modal-employee-name");
  if (nameEl) nameEl.innerText = `${employeeName} — rôle ${employeeRole}`;
  
  const modal = document.getElementById("permissions-modal");
  if (modal) modal.classList.remove("hidden");
  
  const checkList = document.getElementById("permissions-checklist");
  if (checkList) checkList.innerHTML = '<div class="text-center text-slate-400 py-6"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

  await refreshPermissionsModal(employeeRole);
}

async function refreshPermissionsModal(employeeRole) {
  const role = employeeRole || permModalState.employeeRole;
  permModalState.employeeRole = role;

  try {
    const [roleRes, overridesRes] = await Promise.all([
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/read-role-permissions?role=${encodeURIComponent(role)}`),
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/read-permission-overrides?employee_id=${permModalState.employeeId}`),
    ]);

    if (!roleRes.ok) throw new Error("Impossible de lire les permissions du rôle.");
    const roleData = await roleRes.json();
    permModalState.rolePermissions = roleData.permissions || {};
    permModalState.overrides = overridesRes.ok ? await overridesRes.json() : [];
    permModalState.changes = {};

    renderPermissionsOverridesList();
    renderPermissionsChecklist();
  } catch (e) {
    console.error("Erreur chargement accès personnalisés:", e);
    const checkList = document.getElementById("permissions-checklist");
    if (checkList) checkList.innerHTML = '<div class="text-center text-red-400 py-6 text-xs">Erreur de chargement.</div>';
  }
}

function renderPermissionsOverridesList() {
  const section = document.getElementById("permissions-overrides-section");
  const list = document.getElementById("permissions-overrides-list");
  if (!section || !list) return;

  if (permModalState.overrides.length === 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  list.innerHTML = permModalState.overrides.map((ov) => `
    <div class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-3">
      <div class="text-xs">
        <span class="font-bold text-slate-800">${humanizePermission(ov.permission_name)}</span>
        <span class="ml-2 text-[9px] font-black uppercase ${ov.mode === "ADD" ? "text-emerald-700" : "text-red-600"}">${ov.mode === "ADD" ? "Ajouté" : "Retiré"}</span>
        <div class="text-slate-400 text-[10px] mt-0.5">${ov.expires_at ? `Expire le ${new Date(ov.expires_at).toLocaleString("fr-FR")}` : "Permanent"}</div>
      </div>
      <div class="flex gap-1">
        ${ov.expires_at ? `<button onclick="window.extendPermissionOverride('${ov.id}')" title="Prolonger" class="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600"><i class="fa-solid fa-clock-rotate-left"></i></button>
        <button onclick="window.convertPermissionOverrideToPermanent('${ov.id}')" title="Rendre permanent" class="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-emerald-600"><i class="fa-solid fa-infinity"></i></button>` : ""}
        <button onclick="window.revokePermissionOverride('${ov.id}')" title="Révoquer" class="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-red-600"><i class="fa-solid fa-ban"></i></button>
      </div>
    </div>
  `).join("");
}

function renderPermissionsChecklist() {
  const container = document.getElementById("permissions-checklist");
  if (!container) return;
  const keys = Object.keys(permModalState.rolePermissions).sort();

  container.innerHTML = keys.map((key) => {
    const perm = permModalState.rolePermissions[key];
    const override = permModalState.overrides.find((o) => o.permission_name === key);
    const effectiveChecked = override ? override.mode === "ADD" : perm.default;
    const rowId = `perm-row-${key}`;

    if (perm.locked) {
      return `
        <div class="flex items-center gap-3 py-2 border-b border-slate-50 opacity-50" title="Liée au rôle, non modifiable">
          <input type="checkbox" disabled ${perm.default ? "checked" : ""} class="w-4 h-4 rounded">
          <span class="text-xs font-medium text-slate-500 flex-1">${humanizePermission(key)}</span>
          <i class="fa-solid fa-lock text-[10px] text-slate-300"></i>
        </div>`;
    }

    return `
      <div id="${rowId}" class="flex items-center gap-3 py-2 border-b border-slate-50">
        <input type="checkbox" ${effectiveChecked ? "checked" : ""}
          onchange="window.onPermissionCheckboxChange('${key}', this.checked)"
          class="w-4 h-4 rounded border-slate-300 text-blue-600">
        <span class="text-xs font-medium text-slate-700 flex-1">${humanizePermission(key)}</span>
        <input type="datetime-local" id="perm-expiry-${key}" title="Expire le (vide = permanent)"
          class="text-[10px] border border-slate-200 rounded-lg px-2 py-1 w-36">
      </div>`;
  }).join("");
}

export function onPermissionCheckboxChange(permKey, checked) {
  const def = permModalState.rolePermissions[permKey]?.default;
  if (checked === def) {
    delete permModalState.changes[permKey];
  } else {
    permModalState.changes[permKey] = { mode: checked ? "ADD" : "REMOVE" };
  }
}

export async function savePermissionOverrides() {
  const keys = Object.keys(permModalState.changes);
  if (keys.length === 0) {
    return Swal.fire("Info", "Aucun changement à enregistrer.", "info");
  }

  Swal.fire({ title: "Enregistrement...", didOpen: () => Swal.showLoading(), allowOutsideClick: false });

  try {
    for (const permKey of keys) {
      const change = permModalState.changes[permKey];
      const expiryInput = document.getElementById(`perm-expiry-${permKey}`);
      const expires_at = expiryInput?.value ? new Date(expiryInput.value).toISOString() : null;

      const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/grant-permission-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: permModalState.employeeId,
          permission_name: permKey,
          mode: change.mode,
          expires_at,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Échec sur ${permKey}`);
      }
    }

    await refreshPermissionsModal();
    Swal.fire("Succès", "Accès mis à jour.", "success");
  } catch (e) {
    Swal.fire("Erreur", e.message, "error");
  }
}

export async function extendPermissionOverride(id) {
  const { value: newDate } = await Swal.fire({
    title: "Prolonger jusqu'à quand ?",
    input: "datetime-local",
    showCancelButton: true,
    confirmButtonText: "Prolonger",
  });
  if (!newDate) return;

  await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/extend-permission-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, new_expires_at: new Date(newDate).toISOString() }),
  });
  await refreshPermissionsModal();
}

export async function convertPermissionOverrideToPermanent(id) {
  const confirmRes = await Swal.fire({ title: "Rendre cet accès permanent ?", icon: "question", showCancelButton: true });
  if (!confirmRes.isConfirmed) return;

  await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/convert-permission-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await refreshPermissionsModal();
}

export async function revokePermissionOverride(id) {
  const confirmRes = await Swal.fire({ title: "Révoquer cet accès ?", icon: "warning", showCancelButton: true, confirmButtonColor: "#dc2626" });
  if (!confirmRes.isConfirmed) return;

  await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/revoke-permission-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await refreshPermissionsModal();
}

export function closePermissionsModal() {
  const modal = document.getElementById("permissions-modal");
  if (modal) modal.classList.add("hidden");
}

export async function submitUpdate(e) {
  e.preventDefault();
  const hiddenId = document.getElementById("edit-id-hidden");
  const id = hiddenId ? hiddenId.value : "";
  if (!id) return;

  const getVal = (fieldId) => {
    const el = document.getElementById(fieldId);
    return el ? el.value : "";
  };

  const newVal = {
    statut: getVal("edit-statut"),
    role: getVal("edit-role"),
    dept: getVal("edit-dept"),
    limit: getVal("edit-type-contrat"),
    employee_type: getVal("edit-type"),
    secteur: getVal("edit-secteur"),
    perimetre_lieux: getVal("edit-perimetre-lieux"),
    contenu_pointage: getVal("edit-contenu-pointage"),
    rythme: getVal("edit-rythme"),
    start_date: getVal("edit-start-date"),
    manager_id: getVal("edit-manager") || null,
    salaire: getVal("edit-salaire-fixe"),
    transport: getVal("edit-indemnite-transport"),
    logement: getVal("edit-indemnite-logement"),
  };

  const changes = {};

  if (newVal.statut !== AppState.currentEditingOriginal.statut)
    changes.statut = newVal.statut;
  if (newVal.role !== AppState.currentEditingOriginal.role)
    changes.role = newVal.role;
  if (newVal.dept !== AppState.currentEditingOriginal.dept)
    changes.dept = newVal.dept;
  if (newVal.employee_type !== AppState.currentEditingOriginal.employee_type)
    changes.employee_type = newVal.employee_type;
  if (newVal.secteur !== AppState.currentEditingOriginal.secteur)
    changes.secteur = newVal.secteur;
  if (newVal.perimetre_lieux !== AppState.currentEditingOriginal.perimetre_lieux)
    changes.perimetre_lieux = newVal.perimetre_lieux;
  if (newVal.contenu_pointage !== AppState.currentEditingOriginal.contenu_pointage)
    changes.contenu_pointage = newVal.contenu_pointage;
  if (newVal.rythme !== AppState.currentEditingOriginal.rythme)
    changes.rythme = newVal.rythme;

  if (document.getElementById("edit-mode_paiement_defaut") && window.collectPaymentFields) {
    const paiement = window.collectPaymentFields("edit");
    if (paiement.erreurs.length > 0) {
      Swal.fire("Coordonnées de paiement", paiement.erreurs.join("\n"), "warning");
      return;
    }
    const orig = AppState.currentEditingOriginal;
    Object.entries(paiement.valeurs).forEach(([cle, val]) => {
      const avant = orig[cle] || null;
      const apres = val || null;
      if (avant !== apres) changes[cle] = apres === null ? "" : apres;
    });
  }

  if (newVal.manager_id != AppState.currentEditingOriginal.manager_id) {
    changes.manager_id = newVal.manager_id;
  }

  const scopeVal = getVal("edit-scope");
  const scopeArray = scopeVal ? scopeVal.split(",").map((s) => s.trim()) : [];
  if (
    JSON.stringify(scopeArray) !==
    JSON.stringify(AppState.currentEditingOriginal.scope || [])
  ) {
    changes.scope = JSON.stringify(scopeArray);
  }

  const originalDate = convertToInputDate(AppState.currentEditingOriginal.date);
  if (
    newVal.start_date !== originalDate ||
    newVal.limit !== AppState.currentEditingOriginal.limit
  ) {
    changes.start_date = newVal.start_date;
    changes.limit = newVal.limit;
    changes.recalculate_contract = "true";
  }

  if (parseFloat(newVal.salaire) !== parseFloat(AppState.currentEditingOriginal.salaire_base_fixe))
    changes.salaire_brut_fixe = newVal.salaire;

  if (parseFloat(newVal.transport) !== parseFloat(AppState.currentEditingOriginal.indemnite_transport))
    changes.indemnite_transport = newVal.transport;

  if (parseFloat(newVal.logement) !== parseFloat(AppState.currentEditingOriginal.indemnite_logement))
    changes.indemnite_logement = newVal.logement;

  const initCheck = document.getElementById("edit-init-check");
  const forceInit = initCheck ? initCheck.checked : false;

  if (Object.keys(changes).length === 0 && !forceInit) {
    Swal.fire("Info", "Aucune modification détectée.", "info");
    closeEditModal();
    return;
  }

  Swal.fire({
    title: "Mise à jour...",
    text: "Synchronisation...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  const params = new URLSearchParams({
    id: id,
    agent: AppState.currentUser?.nom || "",
    force_init: forceInit,
    ...changes,
  });

  try {
    const response = await secureFetch(`${URL_UPDATE}?${params.toString()}`);
    if (response.ok) {
      closeEditModal();
      await Swal.fire("Succès", "Les modifications ont été enregistrées.", "success");
      if (typeof window.refreshAllData === "function") window.refreshAllData(true);
    } else {
      throw new Error("Erreur serveur lors de la mise à jour");
    }
  } catch (e) {
    Swal.fire("Erreur", e.message, "error");
  }
}

export async function deleteEmployee(id) {
  const emp = AppState.employees.find((e) => String(e.id) === String(id));
  const empName = emp ? emp.nom : "ce collaborateur";

  const result = await Swal.fire({
    title: "Suppression Définitive",
    text: `Êtes-vous sûr de vouloir supprimer ${empName} ? Cette action effacera son profil, son historique et ses accès au système.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Oui, supprimer",
    cancelButtonText: "Annuler",
  });

  if (result.isConfirmed) {
    Swal.fire({
      title: "Suppression en cours...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/delete-employee`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id, agent: AppState.currentUser?.nom || "" }),
        },
      );

      if (response.ok) {
        Swal.fire("Supprimé !", "Le collaborateur a été retiré de la base.", "success");
        fetchData(true, 1);
      } else {
        const err = await response.json();
        throw new Error(err.error || "Erreur serveur lors de la suppression.");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Erreur", error.message, "error");
    }
  }
}

export async function openBulkManagerModal() {
  const selectedIds = Array.from(
    document.querySelectorAll(".emp-select-checkbox:checked"),
  ).map((cb) => cb.value);

  if (selectedIds.length === 0) return;

  try {
    const r = await secureFetch(`${URL_READ}?limit=500&status=Actif`);
    const result = await r.json();
    const potentialManagers = result.data || [];

    let options = `<option value="">-- Aucun / Détacher --</option>`;
    potentialManagers.forEach((m) => {
      if (!selectedIds.includes(m.id)) {
        options += `<option value="${m.id}">${m.nom} (${m.poste})</option>`;
      }
    });

    const { value: managerId } = await Swal.fire({
      title: `Assigner ${selectedIds.length} personnes`,
      html: `
        <p class="text-sm text-slate-500 mb-4">Choisissez le responsable hiérarchique direct (N+1).</p>
        <select id="bulk-manager-select" class="swal2-input text-sm">${options}</select>
      `,
      showCancelButton: true,
      confirmButtonText: "Valider",
      confirmButtonColor: "#0f172a",
      preConfirm: () => document.getElementById("bulk-manager-select").value,
    });

    if (typeof managerId !== "undefined") {
      Swal.fire({ title: "Mise à jour...", didOpen: () => Swal.showLoading() });

      const res = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/bulk-assign-manager`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_ids: selectedIds,
            manager_id: managerId || null,
          }),
        },
      );

      if (res.ok) {
        Swal.fire("Succès", "Hiérarchie mise à jour !", "success");
        fetchData(true);
        const bar = document.getElementById("bulk-action-bar");
        if (bar) bar.classList.add("hidden");
      }
    }
  } catch (e) {
    console.error(e);
    Swal.fire("Erreur", "Impossible de charger la liste ou de mettre à jour.", "error");
  }
}

export function toggleBulkActions() {
  const checkboxes = document.querySelectorAll(".emp-select-checkbox:checked");
  const bar = document.getElementById("bulk-action-bar");
  const countSpan = document.getElementById("selected-count");

  if (bar && countSpan) {
    if (checkboxes.length > 0) {
      bar.classList.remove("hidden");
      countSpan.innerText = checkboxes.length;
    } else {
      bar.classList.add("hidden");
    }
  }
}

export async function generateDraftContract(id) {
  const e = AppState.employees.find((x) => String(x.id) === String(id));
  if (!e) return;

  Swal.fire({
    title: "Génération du Brouillon...",
    text: "Conversion du modèle en PDF sécurisé...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const token = localStorage.getItem("sirh_token");

    const response = await fetch(
      `${URL_CONTRACT_GENERATE}?id=${id}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Erreur lors de la génération");
    }

    const blob = await response.blob();
    const pdfUrl = window.URL.createObjectURL(blob);

    Swal.close();
    if (typeof window.viewDocument === "function") {
      window.viewDocument(pdfUrl, `Prévisualisation Contrat : ${e.nom}`);
    }
  } catch (error) {
    console.error("Erreur Brouillon:", error);
    Swal.fire("Erreur", error.message, "error");
  }
}

export function openContractModal(id) {
  const hiddenId = document.getElementById("contract-id-hidden");
  if (hiddenId) hiddenId.value = id;
  const modal = document.getElementById("contract-modal");
  if (modal) modal.classList.remove("hidden");

  const canvas = document.getElementById("signature-pad");
  if (canvas && typeof SignaturePad !== "undefined") {
    AppState.signaturePad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255, 255, 255, 0)",
      penColor: "rgb(0, 0, 0)",
    });

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    AppState.signaturePad.clear();
  }
}

export function closeContractModal() {
  if (AppState.contractStream) {
    AppState.contractStream.getTracks().forEach((t) => t.stop());
    AppState.contractStream = null;
  }
  const modal = document.getElementById("contract-modal");
  if (modal) modal.classList.add("hidden");
}

export function clearSignature() {
  if (AppState.signaturePad) AppState.signaturePad.clear();
}

export function exportToCSV() {
  if (!AppState.employees || AppState.employees.length === 0) {
    return Swal.fire("Erreur", "Aucune donnée à exporter", "warning");
  }

  const headers = [
    "Matricule",
    "Nom Complet",
    "Poste",
    "Departement",
    "Statut",
    "Email",
    "Telephone",
    "Date Embauche",
    "Duree Contrat",
  ];

  let csvContent = headers.join(";") + "\n";

  AppState.employees.forEach((e) => {
    const row = [
      e.id,
      e.nom,
      e.poste,
      e.dept,
      e.statut,
      e.email || "",
      e.telephone || "",
      e.date || "",
      e.limit,
    ];

    const cleanRow = row.map((val, index) => {
      let str = String(val || "").replace(/"/g, '""');
      if (index === 0 || index === 6) {
        return `"\t${str}"`;
      }
      return `"${str}"`;
    });
    csvContent += cleanRow.join(";") + "\n";
  });

  const blob = new Blob(["\ufeff" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toLocaleDateString("fr-FR").replace(/\//g, "-");

  link.setAttribute("href", url);
  link.setAttribute("download", `Rapport_Effectif_${dateStr}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
  });
  Toast.fire({ icon: "success", title: "Exportation réussie !" });
}

export async function submitSignedContract() {
  if (!AppState.signaturePad || AppState.signaturePad.isEmpty()) {
    return Swal.fire("Attention", "Veuillez signer avant de valider.", "warning");
  }

  const hiddenId = document.getElementById("contract-id-hidden");
  const id = hiddenId ? hiddenId.value : "";
  const signatureBase64 = AppState.signaturePad.toDataURL();

  Swal.fire({
    title: "Signature en cours...",
    text: "Incrustation dans le document...",
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false,
  });

  try {
    const r = await secureFetch(URL_UPLOAD_SIGNED_CONTRACT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: id,
        signature: signatureBase64,
        agent: AppState.currentUser?.nom || "",
      }),
    });

    const result = await r.json();

    if (r.ok && result.status === "success") {
      closeContractModal();
      Swal.fire({
        icon: "success",
        title: "Contrat Signé !",
        text: "Le document a été généré avec votre signature.",
        showCancelButton: true,
        confirmButtonText: "📥 Télécharger",
        cancelButtonText: "Fermer",
      }).then((choice) => {
        if (choice.isConfirmed && result.url) {
          window.open(result.url, "_blank");
        }
      });
      if (typeof window.refreshAllData === "function") window.refreshAllData(true);
    } else {
      throw new Error(result.error || "Erreur lors de la signature");
    }
  } catch (e) {
    console.error(e);
    Swal.fire("Erreur", e.message, "error");
  }
}

export async function triggerManualContractUpload(employeeId) {
  const { value: file } = await Swal.fire({
    title: "Contrat scanné / Physique",
    text: "Sélectionnez le PDF ou prenez une photo du contrat signé manuellement.",
    input: "file",
    inputAttributes: {
      accept: "application/pdf,image/*",
      "aria-label": "Uploader le contrat",
    },
    showCancelButton: true,
    confirmButtonText: "Envoyer le document",
    confirmButtonColor: "#10b981",
    cancelButtonText: "Annuler",
  });

  if (file) {
    Swal.fire({
      title: "Envoi en cours...",
      text: "Archivage du document...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const fd = new FormData();
    fd.append("id", employeeId);
    fd.append("contract_file", file);
    fd.append("mode", "manual_scan");
    fd.append("agent", AppState.currentUser?.nom || "");

    try {
      const response = await secureFetch(URL_UPLOAD_SIGNED_CONTRACT, {
        method: "POST",
        body: fd,
      });

      if (response.ok) {
        Swal.fire("Succès !", "Le contrat scanné a été enregistré avec succès.", "success");
        if (typeof window.refreshAllData === "function") window.refreshAllData();
      } else {
        throw new Error("Le serveur a répondu avec une erreur.");
      }
    } catch (error) {
      console.error("Erreur Upload:", error);
      Swal.fire("Échec", "Impossible d'envoyer le fichier : " + error.message, "error");
    }
  }
}

export async function downloadMyBadge() {
  if (!AppState.employees || AppState.employees.length === 0) {
    return Swal.fire("Patientez", "Le système charge vos données...", "info");
  }

  const cleanUser = (AppState.currentUser?.nom || "").toLowerCase().replace(/[\.-_]/g, " ").trim();
  let myData = AppState.employees.find((e) => {
    const cleanEmp = (e.nom || "").toLowerCase().replace(/[\.-_]/g, " ").trim();
    return cleanEmp.includes(cleanUser) || cleanUser.includes(cleanEmp);
  });

  if (!myData && AppState.currentUser?.id) {
    myData = AppState.employees.find((e) => String(e.id) === String(AppState.currentUser.id));
  }

  if (!myData) {
    return Swal.fire("Erreur", "Impossible de localiser votre fiche employé.", "error");
  }

  const token = localStorage.getItem("sirh_token");
  Swal.fire({ title: "Génération du badge...", text: "Veuillez patienter", didOpen: () => Swal.showLoading(), allowOutsideClick: false });

  try {
    const photoUrl = myData.photo ? formatGoogleLink(myData.photo) : "";
    const url = `${URL_BADGE_GEN}?id=${encodeURIComponent(myData.id)}&nom=${encodeURIComponent(myData.nom)}&poste=${encodeURIComponent(myData.poste)}&photo=${encodeURIComponent(photoUrl)}&agent=${encodeURIComponent(AppState.currentUser?.nom || "")}`;

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("Erreur serveur");

    const htmlContent = await response.text();
    Swal.close();

    const w = window.open("", "_blank", "width=450,height=700");
    if (w) {
      w.document.open();
      w.document.write(htmlContent);
      w.document.close();
    } else {
      Swal.fire("Pop-up bloqué", "Veuillez autoriser les fenêtres surgissantes pour voir votre badge.", "warning");
    }
  } catch (error) {
    console.error(error);
    Swal.fire("Erreur", "Une erreur technique est survenue.", "error");
  }
}

export async function printBadge(id) {
  const e = AppState.employees.find((x) => String(x.id) === String(id));
  if (!e) return;

  const token = localStorage.getItem("sirh_token");
  Swal.fire({ title: "Génération...", didOpen: () => Swal.showLoading() });

  try {
    const url = `${URL_BADGE_GEN}?id=${encodeURIComponent(id)}&nom=${encodeURIComponent(e.nom)}&poste=${encodeURIComponent(e.poste)}&photo=${encodeURIComponent(formatGoogleLink(e.photo) || "")}&agent=${encodeURIComponent(AppState.currentUser?.nom || "")}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("Erreur génération");

    const htmlContent = await response.text();
    Swal.close();

    const w = window.open("", "_blank", "width=400,height=600");
    if (w) {
      w.document.open();
      w.document.write(htmlContent);
      w.document.close();
    }
  } catch (error) {
    console.error(error);
    Swal.fire("Erreur", "Impossible de générer le badge : " + error.message, "error");
  }
}

export function openFormEditor() {
  Swal.fire({
    title: "Modifier le formulaire ?",
    text: "Vous allez être redirigé vers l'interface de modification d'Airtable.",
    icon: "info",
    showCancelButton: true,
    confirmButtonText: "Y aller",
    cancelButtonText: "Annuler",
    confirmButtonColor: "#0f172a",
  }).then((result) => {
    if (result.isConfirmed) {
      window.open(AIRTABLE_FORM_EDIT_LINK, "_blank");
    }
  });
}

export function copyFormLink() {
  navigator.clipboard.writeText(AIRTABLE_FORM_PUBLIC_LINK).then(() => {
    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 3000,
    });
    Toast.fire({ icon: "success", title: "Lien copié !" });
  }).catch(() => {
    Swal.fire("Erreur", "Impossible de copier le lien automatiquement.", "error");
  });
}

export async function handleCandidateAction(id, action) {
  const conf = {
    VALIDER_POUR_ENTRETIEN: { t: "Inviter en entretien ?", c: "#2563eb", txt: "Un email d'invitation sera envoyé." },
    REFUS_IMMEDIAT: { t: "Refuser la candidature ?", c: "#ef4444", txt: "Un email de refus immédiat sera envoyé." },
    ACCEPTER_EMBAUCHE: { t: "Confirmer l'embauche ?", c: "#10b981", txt: "Cela créera le profil employé et enverra les accès." },
    REFUS_APRES_ENTRETIEN: { t: "Refuser après entretien ?", c: "#f97316", txt: "Un email de refus personnalisé sera envoyé." },
  }[action];

  const res = await Swal.fire({
    title: conf.t,
    text: conf.txt,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: conf.c,
    confirmButtonText: "Oui, confirmer",
    cancelButtonText: "Annuler",
  });

  if (res.isConfirmed) {
    let employeeType = "OFFICE";
    let chosenDept = "À définir";

    if (action === "ACCEPTER_EMBAUCHE") {
      const depRes = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-departments`);
      const depts = await depRes.json();
      let deptOptions = depts.map((d) => `<option value="${d.code}">${d.label}</option>`).join("");

      const { value: selection } = await Swal.fire({
        title: "Paramètres d'embauche",
        html: `
          <div class="text-left">
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Type d'activité</label>
              <select id="swal-emp-type" class="swal2-input !mt-0">
                  <option value="OFFICE">🏢 Bureau (Fixe)</option>
                  <option value="FIXED">🏠 Agent Site (Fixe)</option>
                  <option value="MOBILE">🚗 Délégué (Nomade)</option>
              </select>
              <label class="block text-[10px] font-black text-slate-400 uppercase mt-4 mb-1">Affectation Département</label>
              <select id="swal-dept" class="swal2-input !mt-0">
                  <option value="">-- Sélectionner --</option>
                  ${deptOptions}
              </select>
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: "#10b981",
        preConfirm: () => {
          const type = document.getElementById("swal-emp-type").value;
          const dept = document.getElementById("swal-dept").value;
          if (!dept) {
            Swal.showValidationMessage("Veuillez choisir un département");
            return false;
          }
          return { employeeType: type, department: dept };
        },
      });

      if (!selection) return;
      employeeType = selection.employeeType;
      chosenDept = selection.department;
    }

    Swal.fire({ title: "Action en cours...", text: "Mise à jour du dossier...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      const response = await secureFetch(URL_CANDIDATE_ACTION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id,
          action: action,
          agent: AppState.currentUser?.nom || "",
          employee_type: employeeType,
          departement: chosenDept,
        }),
      });

      const result = await response.json();
      if (result && result.status === "success") {
        Swal.fire("Succès", "Action effectuée avec succès.", "success");
        fetchCandidates();
        if (action === "ACCEPTER_EMBAUCHE") fetchData(true);
      } else {
        throw new Error(result.error || "Le serveur n'a pas confirmé l'action");
      }
    } catch (e) {
      Swal.fire("Échec du traitement", e.message, "error");
    }
  }
}

export function showCandidateDocs(id) {
  const c = AppState.currentCandidates?.find((cand) => String(cand.id) === String(id));
  if (!c) return Swal.fire('Erreur', 'Dossier introuvable', 'error');

  const nom = c.nom_complet || "Candidat";
  const poste = c.poste_vise || "Non précisé";
  const email = c.email || "Non renseigné";
  const tel = c.telephone || "Non renseigné";
  const adresse = c.adresse || "Non renseignée";
  const exp = c.experience || "Non précisée";
  const dispo = c.disponibilite || "Non précisée";
  const pretentions = c.pretentions ? new Intl.NumberFormat('fr-FR').format(c.pretentions) + ' CFA' : "Non précisées";
  const dateN = c.date_naissance ? new Date(c.date_naissance).toLocaleDateString('fr-FR') : "Non renseignée";

  const getUrl = (u) => (u && u !== "null" && u.length > 5) ? u : null;
  
  const docs = [
    { id: "cv", label: "CV / Parcours", url: getUrl(c.cv_url), icon: "fa-file-user", color: "blue" },
    { id: "lm", label: "Lettre Motiv.", url: getUrl(c.lm_url), icon: "fa-envelope-open-text", color: "pink" },
    { id: "id_card", label: "Pièce Identité", url: getUrl(c.id_card_url), icon: "fa-id-card", color: "purple" },
    { id: "dip", label: "Diplôme", url: getUrl(c.diploma_url), icon: "fa-graduation-cap", color: "emerald" },
    { id: "att", label: "Attestation", url: getUrl(c.attestation_url), icon: "fa-file-invoice", color: "orange" },
  ];

  let buttonsHtml = '<div class="flex flex-col gap-2">';
  let firstDocUrl = null;
  let hasDocs = false;

  docs.forEach((d) => {
    if (d.url) {
      hasDocs = true;
      if (!firstDocUrl) firstDocUrl = d.url;
      buttonsHtml += `
        <button onclick="changePreview('${d.url}', this)" 
            class="doc-btn w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-left group shadow-sm">
            <div class="w-8 h-8 shrink-0 rounded-lg bg-${d.color}-50 flex items-center justify-center text-${d.color}-600 group-hover:scale-110 transition-transform">
                <i class="fa-solid ${d.icon} text-sm"></i>
            </div>
            <div class="overflow-hidden flex-1 min-w-0">
                <p class="text-[8px] font-black text-slate-400 uppercase tracking-wide">DOCUMENT</p>
                <p class="text-xs font-bold text-slate-700 truncate">${d.label}</p>
            </div>
        </button>`;
    }
  });
  buttonsHtml += "</div>";

  window.changePreview = function (url, btn) {
    document.querySelectorAll(".doc-btn").forEach((b) => {
      b.classList.remove("ring-2", "ring-blue-500", "bg-blue-50/50");
      b.classList.add("bg-white", "border-slate-200");
    });
    if (btn) btn.classList.add("ring-2", "ring-blue-500", "bg-blue-50/50");

    const viewerFrame = document.getElementById("doc-viewer-frame");
    const viewerImg = document.getElementById("doc-viewer-img");
    const extLink = document.getElementById("external-link-btn");
    const container = document.getElementById("preview-container");

    if (extLink) extLink.href = url;

    const isImageExtension = url.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i);
    const isAirtableImage = url.includes("airtableusercontent") && !url.toLowerCase().includes(".pdf");
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    
    let finalUrl = url;

    if (driveMatch) {
      finalUrl = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
      viewerFrame.classList.add("hidden");
      viewerImg.classList.remove("hidden");
      viewerImg.src = finalUrl;
    } else if (isImageExtension || isAirtableImage) {
      viewerFrame.classList.add("hidden");
      viewerImg.classList.remove("hidden");
      viewerImg.src = url;
      container.classList.remove("overflow-hidden");
      container.classList.add("overflow-y-auto", "overflow-x-hidden");
    } else {
      viewerImg.classList.add("hidden");
      viewerFrame.classList.remove("hidden");
      if (url.includes("drive.google.com") && url.includes("/view"))
        finalUrl = url.replace("/view", "/preview");
      viewerFrame.src = finalUrl;
      container.classList.add("overflow-hidden");
      container.classList.remove("overflow-y-auto");
    }
  };

  Swal.fire({
    title: null,
    width: "1150px",
    padding: "0",
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { popup: "rounded-[2rem] overflow-hidden viewer-modal", htmlContainer: "!m-0" },
    html: `
      <div class="flex flex-col md:flex-row h-[650px] text-left">
          <div class="w-full md:w-[35%] p-8 border-r border-slate-100 overflow-y-auto custom-scroll bg-white">
              <div class="mb-6">
                  <p class="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Candidat</p>
                  <h2 class="text-2xl font-black text-slate-800 leading-tight mb-2">${nom}</h2>
                  <span class="inline-block bg-slate-900 text-white text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-wide">
                      ${poste}
                  </span>
              </div>
              <div class="space-y-3 mb-8">
                  <div class="flex items-center gap-3 text-xs text-slate-600">
                      <i class="fa-solid fa-envelope w-4 text-slate-400"></i> <span class="truncate">${email}</span>
                  </div>
                  <div class="flex items-center gap-3 text-xs text-slate-600">
                      <i class="fa-solid fa-phone w-4 text-slate-400"></i> <b>${tel}</b>
                  </div>
                  <div class="flex items-center gap-3 text-xs text-slate-600">
                      <i class="fa-solid fa-location-dot w-4 text-slate-400"></i> ${adresse}
                  </div>
                  <div class="flex items-center gap-3 text-xs text-slate-600">
                      <i class="fa-solid fa-cake-candles w-4 text-slate-400"></i> Né(e) le ${dateN}
                  </div>
              </div>
              <div class="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4 mb-8">
                  <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Évaluation Profil</p>
                  <div class="flex justify-between border-b border-slate-200 pb-2">
                      <span class="text-xs text-slate-500">Expérience</span>
                      <span class="text-xs font-bold text-slate-800">${exp}</span>
                  </div>
                  <div class="flex justify-between border-b border-slate-200 pb-2">
                      <span class="text-xs text-slate-500">Disponibilité</span>
                      <span class="text-xs font-bold text-slate-800">${dispo}</span>
                  </div>
                  <div class="flex justify-between">
                      <span class="text-xs text-slate-500">Prétentions</span>
                      <span class="text-xs font-black text-emerald-600">${pretentions}</span>
                  </div>
              </div>
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Documents joints</p>
              ${buttonsHtml}
              <div class="mt-8">
                  <button onclick="Swal.close()" class="w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-xs hover:bg-slate-200 transition-all uppercase tracking-widest">
                      Fermer le dossier
                  </button>
              </div>
          </div>
          <div id="preview-container" class="flex-1 bg-slate-900 relative flex flex-col items-center shadow-inner overflow-x-hidden">
              ${hasDocs ? `
                  <div class="absolute top-4 right-4 z-10 sticky">
                      <a id="external-link-btn" href="${firstDocUrl}" target="_blank" class="bg-white/90 backdrop-blur text-slate-700 px-4 py-2 rounded-xl text-[10px] font-black shadow-xl hover:text-blue-600 transition-all flex items-center gap-2">
                          <i class="fa-solid fa-up-right-from-square"></i> Plein écran
                      </a>
                  </div>
                  <iframe id="doc-viewer-frame" src="" class="w-full h-full bg-white hidden" frameborder="0"></iframe>
                  <img id="doc-viewer-img" class="w-full h-auto min-h-full bg-black/5 hidden object-top">
              ` : `
                  <div class="h-full flex flex-col items-center justify-center text-slate-500">
                      <i class="fa-solid fa-folder-open text-6xl opacity-20 mb-4"></i>
                      <p class="text-sm font-bold uppercase tracking-widest">Dossier vide</p>
                  </div>
              `}
          </div>
      </div>`,
    didOpen: () => {
      const firstBtn = document.querySelector(".doc-btn");
      if (firstBtn && firstDocUrl) window.changePreview(firstDocUrl, firstBtn);
    },
  });
}

export async function fetchCandidates() {
  const body = document.getElementById("candidates-body");
  if (!body) return;
  body.innerHTML = '<tr><td colspan="4" class="p-8 text-center"><i class="fa-solid fa-circle-notch fa-spin text-blue-600 text-2xl"></i><p class="text-xs text-slate-400 mt-2 font-bold uppercase">Chargement des talents...</p></td></tr>';

  try {
    const r = await secureFetch(`${URL_READ_CANDIDATES}?agent=${encodeURIComponent(AppState.currentUser?.nom || "")}`);
    let rawData = await r.json();

    let candidates = [];
    if (Array.isArray(rawData)) { candidates = rawData; } 
    else if (typeof rawData === "object" && rawData !== null) { candidates = rawData.data || rawData.items || [rawData]; }

    AppState.currentCandidates = candidates; 
    body.innerHTML = "";

    if (candidates.length === 0) {
      body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">Aucune candidature en attente</td></tr>';
      return;
    }

    candidates.forEach((c) => {
      const displayNom = c.nom_complet || c.Nom_complet || c.nom || "Inconnu";
      const safeId = c.id;

      let stRaw = c.statut || "Nouveau";
      let stLogic = stRaw.toString().toLowerCase().trim();

      let badgeClass = "bg-slate-100 text-slate-600";
      if (stLogic.includes("entretien")) badgeClass = "bg-blue-100 text-blue-700";
      else if (stLogic.includes("embauché") || stLogic.includes("validé")) badgeClass = "bg-emerald-100 text-emerald-700";
      else if (stLogic.includes("refus")) badgeClass = "bg-red-50 text-red-500";
      else if (stLogic.includes("nouveau")) badgeClass = "bg-yellow-50 text-yellow-700";

      const btnDocs = `
        <button onclick="window.showCandidateDocs('${c.id}')" 
                class="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:text-blue-600 hover:border-blue-200 shadow-sm transition-all mr-2" title="Ouvrir le dossier complet">
            <i class="fa-solid fa-folder-open"></i>
        </button>
      `;

      let actionButtons = "";
      if (stLogic === "nouveau" || !c.statut) {
        actionButtons = `
          ${btnDocs}
          <button onclick="window.handleCandidateAction('${safeId}', 'VALIDER_POUR_ENTRETIEN')" class="bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 rounded-lg text-[10px] font-bold uppercase shadow-md shadow-blue-200 transition-all mr-2"><i class="fa-solid fa-calendar-check mr-1"></i> Entretien</button>
          <button onclick="window.handleCandidateAction('${safeId}', 'REFUS_IMMEDIAT')" class="bg-white border border-red-100 text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all"><i class="fa-solid fa-xmark mr-1"></i> Refus</button>
        `;
      } else if (stLogic === "entretien") {
        actionButtons = `
          ${btnDocs}
          <button onclick="window.handleCandidateAction('${safeId}', 'ACCEPTER_EMBAUCHE')" class="bg-emerald-500 text-white hover:bg-emerald-600 px-3 py-2 rounded-lg text-[10px] font-bold uppercase shadow-md shadow-emerald-200 transition-all mr-2"><i class="fa-solid fa-user-plus mr-1"></i> Embaucher</button>
          <button onclick="window.handleCandidateAction('${safeId}', 'REFUS_APRES_ENTRETIEN')" class="bg-white border border-orange-100 text-orange-500 hover:bg-orange px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all"><i class="fa-solid fa-thumbs-down mr-1"></i> Refus</button>
        `;
      } else {
        actionButtons = `${btnDocs} <span class="text-[10px] font-bold text-slate-300 italic">Dossier Traité</span>`;
      }

      body.innerHTML += `
        <tr class="border-b hover:bg-slate-50 transition-colors group">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">${displayNom.charAt(0)}</div>
                    <div>
                        <div class="font-bold text-sm text-slate-800">${displayNom}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${c.email || ""}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 text-xs font-bold text-slate-600 uppercase tracking-tight">${c.poste_vise || "Non précisé"}</td>
            <td class="px-6 py-4 text-center">
                <span class="${badgeClass} px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide border border-black/5 shadow-sm">${stRaw}</span>
            </td>
            <td class="px-6 py-4 text-right flex justify-end items-center">
                ${actionButtons}
            </td>
        </tr>`;
    });
  } catch (e) {
    console.error("Erreur Candidats:", e);
    body.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500 font-bold text-sm bg-red-50 rounded-xl border border-red-100">Erreur de chargement : ${e.message}</td></tr>`;
  }
}

export async function fetchMyActivityRecap() {
  const visitContainer = document.getElementById("my-today-visits");
  const dailyContainer = document.getElementById("my-month-dailies");
  if (!visitContainer) return;

  visitContainer.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-blue-500"></i></div>';
  if (dailyContainer)
    dailyContainer.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-blue-500"></i></div>';

  try {
    const timeHack = Date.now();
    const [visRes, daiRes] = await Promise.all([
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/read-visit-reports?limit=1000&personal=true&t=${timeHack}`),
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/read-daily-reports?limit=100&personal=true&t=${timeHack}`),
    ]);

    const allVisits = await visRes.json();
    const allDailies = await daiRes.json();

    const now = new Date();
    const todayLocal = now.toLocaleDateString();

    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(now.getDate() - 31);

    const myVisits = (allVisits.data || allVisits)
      .filter((v) => {
        if (v.employee_id !== AppState.currentUser?.id) return false;
        return new Date(v.check_in).toLocaleDateString() === todayLocal;
      })
      .sort((a, b) => new Date(b.check_in) - new Date(a.check_in));

    if (myVisits.length > 0) {
      visitContainer.innerHTML = myVisits
        .map(
          (v) => `
            <div class="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 mb-2 animate-fadeIn">
                <div>
                    <p class="text-[10px] font-black text-blue-700 uppercase">${v.lieu_nom}</p>
                    <p class="text-[9px] text-slate-400">
                        ${new Date(v.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                </div>
                <span class="text-[9px] font-bold bg-white px-2 py-1 rounded shadow-sm text-emerald-600">${v.outcome || "VU"}</span>
            </div>
          `,
        )
        .join("");
    } else {
      visitContainer.innerHTML = '<div class="text-center py-6 border border-dashed rounded-xl"><p class="text-[10px] text-slate-400 italic">0 visite trouvée pour ce jour.</p></div>';
    }

    const myDailies = (allDailies.data || allDailies)
      .filter((d) => {
        if (d.employee_id !== AppState.currentUser?.id) return false;
        return new Date(d.report_date) >= thirtyOneDaysAgo;
      })
      .sort((a, b) => new Date(b.report_date) - new Date(a.report_date));

    if (myDailies.length > 0 && dailyContainer) {
      dailyContainer.innerHTML = myDailies
        .map(
          (d) => `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2 animate-fadeIn">
                <p class="text-[9px] font-black text-slate-500 mb-1">${new Date(d.report_date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</p>
                <p class="text-[10px] text-slate-600 italic line-clamp-1">${d.summary}</p>
            </div>
          `,
        )
        .join("");
    } else if (dailyContainer) {
      dailyContainer.innerHTML = '<div class="text-center py-6 border border-dashed rounded-xl"><p class="text-[10px] text-slate-400 italic">0 bilan sur les 31 derniers jours.</p></div>';
    }
  } catch (e) {
    console.error("❌ CRASH FETCH PROFIL:", e);
    if (visitContainer) visitContainer.innerHTML = '<p class="text-[10px] text-red-500">Erreur technique</p>';
  }
}

export async function startContractCamera() {
  try {
    AppState.contractStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const v = document.getElementById("contract-video");
    if (v) {
      v.srcObject = AppState.contractStream;
      v.classList.remove("hidden");
    }
    const preview = document.getElementById("contract-img-preview");
    if (preview) preview.classList.add("hidden");
    const icon = document.getElementById("contract-icon");
    if (icon) icon.classList.add("hidden");
    const btn = document.getElementById("btn-contract-capture");
    if (btn) btn.classList.remove("hidden");
  } catch (e) {
    Swal.fire("Erreur", "Caméra inaccessible", "error");
  }
}

export function takeContractSnapshot() {
  const v = document.getElementById("contract-video");
  if (!v) return;
  const c = document.createElement("canvas");
  c.width = v.videoWidth || 640;
  c.height = v.videoHeight || 480;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(
    (blob) => {
      AppState.contractBlob = blob;
      const img = document.getElementById("contract-img-preview");
      if (img) {
        img.src = URL.createObjectURL(blob);
        img.classList.remove("hidden");
      }
      v.classList.add("hidden");
      const btn = document.getElementById("btn-contract-capture");
      if (btn) btn.classList.add("hidden");
      if (AppState.contractStream) {
        AppState.contractStream.getTracks().forEach((t) => t.stop());
        AppState.contractStream = null;
      }
    },
    "image/jpeg",
    0.8,
  );
}

export function previewContractFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  AppState.contractBlob = file;
  if (file.type.includes("image")) {
    const img = document.getElementById("contract-img-preview");
    if (img) {
      img.src = URL.createObjectURL(file);
      img.classList.remove("hidden");
    }
    const icon = document.getElementById("contract-icon");
    if (icon) icon.classList.add("hidden");
  }
}

export async function viewDocumentHistory(empId, docKey, docLabel) {
  Swal.fire({ title: 'Recherche...', didOpen: () => Swal.showLoading() });
  
  try {
    const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/read-archives?employee_id=${empId}&doc_type=${docKey}`);
    const archives = await response.json();
    
    if (!archives || archives.length === 0) {
      return Swal.fire("Historique Vierge", "Aucune ancienne version n'est enregistrée pour ce document.", "info");
    }

    let html = '<div class="text-left space-y-4 max-h-[60vh] overflow-y-auto custom-scroll pr-2 mt-4">';
    archives.forEach((arc, index) => {
      const dateObj = new Date(arc.created_at);
      const dateStr = dateObj.toLocaleDateString('fr-FR');
      const timeStr = dateObj.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
      const isCurrent = index === 0 ? '<span class="bg-emerald-100 text-emerald-700 text-[9px] px-2 py-0.5 rounded font-black uppercase ml-2">Actif</span>' : '';
      const safeLabel = (docLabel || "").replace(/'/g, "\\'");

      html += `
        <div class="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white transition-all shadow-sm">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center"><i class="fa-solid fa-file-contract"></i></div>
                <div>
                    <p class="text-xs font-bold text-slate-800 uppercase tracking-tighter">Version du ${dateStr} ${isCurrent}</p>
                    <p class="text-[10px] text-slate-400 font-medium">À ${timeStr} • Par ${arc.agent || 'Système'}</p>
                </div>
            </div>
            <button onclick="window.viewDocument('${arc.file_url}', '${safeLabel} - Archive')" class="px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-600 transition-all shadow-md active:scale-95">
                Ouvrir
            </button>
        </div>
      `;
    });
    html += '</div>';

    Swal.fire({
      title: `<span class="text-lg font-black uppercase tracking-tight text-slate-800">Historique : ${docLabel}</span>`,
      html: html,
      width: '600px',
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: 'rounded-2xl' }
    });
  } catch (e) {
    console.error(e);
    Swal.fire("Erreur", "Impossible de charger l'historique.", "error");
  }
}

export function resetContractCamera() {
  AppState.contractBlob = null;
  const preview = document.getElementById("contract-img-preview");
  if (preview) preview.classList.add("hidden");
  const video = document.getElementById("contract-video");
  if (video) video.classList.add("hidden");
  const icon = document.getElementById("contract-icon");
  if (icon) icon.classList.remove("hidden");
  const btn = document.getElementById("btn-contract-capture");
  if (btn) btn.classList.add("hidden");
  if (AppState.contractStream) {
    AppState.contractStream.getTracks().forEach((t) => t.stop());
    AppState.contractStream = null;
  }
}

export async function openBulkArchiveModal(empId) {
  const { value: formValues } = await Swal.fire({
    title: '<span class="text-xl font-black uppercase tracking-tight">Numérisation Massive</span>',
    html: `
      <p class="text-xs text-slate-500 mb-6 px-2 text-left">Sélectionnez les documents scannés ou photographiés. Ils seront compressés et classés automatiquement dans le dossier du collaborateur.</p>
      <div class="space-y-4 text-left bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1"><i class="fa-solid fa-file-signature text-blue-500 mr-1"></i> Contrat signé</label>
              <input type="file" id="bulk-contrat" class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-white file:text-blue-600 file:shadow-sm hover:file:bg-blue-50" accept="image/*,application/pdf">
          </div>
          <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 mt-4"><i class="fa-solid fa-id-card text-purple-500 mr-1"></i> Pièce d'Identité</label>
              <input type="file" id="bulk-id_card" class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-white file:text-purple-600 file:shadow-sm hover:file:bg-purple-50" accept="image/*,application/pdf">
          </div>
          <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 mt-4"><i class="fa-solid fa-file-pdf text-indigo-500 mr-1"></i> Curriculum Vitae</label>
              <input type="file" id="bulk-cv" class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-white file:text-indigo-600 file:shadow-sm hover:file:bg-indigo-50" accept="image/*,application/pdf">
          </div>
          <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 mt-4"><i class="fa-solid fa-graduation-cap text-emerald-500 mr-1"></i> Diplôme</label>
              <input type="file" id="bulk-diploma" class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-white file:text-emerald-600 file:shadow-sm hover:file:bg-emerald-50" accept="image/*,application/pdf">
          </div>
          <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 mt-4"><i class="fa-solid fa-file-invoice text-orange-500 mr-1"></i> Attestation / Autre</label>
              <input type="file" id="bulk-attestation" class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-white file:text-orange-600 file:shadow-sm hover:file:bg-orange-50" accept="image/*,application/pdf">
          </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Archiver les documents",
    confirmButtonColor: "#0f172a",
    cancelButtonText: "Annuler",
    width: '600px',
    customClass: { popup: 'rounded-[2rem]' },
    preConfirm: () => {
      return {
        contrat: document.getElementById('bulk-contrat')?.files?.[0],
        id_card: document.getElementById('bulk-id_card')?.files?.[0],
        cv: document.getElementById('bulk-cv')?.files?.[0],
        diploma: document.getElementById('bulk-diploma')?.files?.[0],
        attestation: document.getElementById('bulk-attestation')?.files?.[0]
      };
    }
  });

  if (formValues) {
    const hasFiles = Object.values(formValues).some((file) => file !== undefined);
    if (!hasFiles) return Swal.fire("Attention", "Vous n'avez sélectionné aucun fichier.", "warning");

    Swal.fire({ title: "Archivage en cours...", text: "Compression et envoi des données...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const fd = new FormData();
    fd.append("employee_id", empId);
    fd.append("agent", AppState.currentUser?.nom || "");

    try {
      const types = ['contrat', 'id_card', 'cv', 'diploma', 'attestation'];
      for (const type of types) {
        const file = formValues[type];
        if (file) {
          const processedFile = file.type.startsWith('image/') ? await compressImage(file) : file;
          fd.append(type, processedFile, file.name); 
        }
      }

      const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/bulk-upload-docs`, {
        method: "POST",
        body: fd
      });

      if (response.ok) {
        const resData = await response.json();
        Swal.fire("Succès", `${resData.count} document(s) archivé(s) avec succès.`, "success");
        await fetchData(true);
        openFullFolder(empId);
      } else {
        throw new Error("Erreur serveur lors de l'archivage.");
      }
    } catch (e) {
      Swal.fire("Erreur", e.message, "error");
    }
  }
}

export async function downloadEmployeeZip(empId, empName) {
  Swal.fire({
    title: 'Création de l\'archive...',
    html: '<p class="text-xs text-slate-500 mb-4">Aspiration et compression des documents en cours.</p><i class="fa-solid fa-file-zipper text-5xl text-slate-800 animate-bounce"></i>',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const token = localStorage.getItem("sirh_token");
    const response = await fetch(`${SIRH_CONFIG.apiBaseUrl}/export-folder/${empId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Erreur du serveur lors de la compression.");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const cleanName = (empName || "employe").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `Dossier_${cleanName}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    Swal.fire("Terminé !", "L'archive a été téléchargée avec succès.", "success");
  } catch (e) {
    console.error("Export ZIP Error:", e);
    Swal.fire("Échec", e.message, "error");
  }
}

// ============================================================
// CACHE HORS-LIGNE
// ============================================================

export function cacheEmployeesLocally(employees) {
  try {
    const cacheData = {
      data: employees,
      timestamp: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };
    localStorage.setItem('sirh_employees_cache', JSON.stringify(cacheData));
  } catch (e) {
    console.warn("Impossible de mettre en cache local", e);
  }
}

export function getCachedEmployees() {
  try {
    const cached = localStorage.getItem('sirh_employees_cache');
    if (!cached) return null;
    const cacheData = JSON.parse(cached);
    if (cacheData.expiresAt < Date.now()) {
      localStorage.removeItem('sirh_employees_cache');
      return null;
    }
    return cacheData.data;
  } catch (e) {
    return null;
  }
}

export function cacheEmployeesMeta(meta) {
  try {
    localStorage.setItem('sirh_employees_meta', JSON.stringify(meta));
  } catch (e) {}
}

export function getCachedEmployeesMeta() {
  try {
    const cached = localStorage.getItem('sirh_employees_meta');
    if (!cached) return null;
    return JSON.parse(cached);
  } catch (e) {
    return null;
  }
}

      


// ============================================================
// FONCTIONS UTILITAIRES MANQUANTES
// ============================================================

// Rafraîchir toutes les données
export async function refreshAllData(force = false) {
  console.log("🔄 Rafraîchissement des données...");
  await fetchData(force, 1);
  await loadMyProfile();
  await window.fetchLeaveRequests();
}


