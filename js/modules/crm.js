import { AppState } from "../core/state.js";
import { SIRH_CONFIG } from "../core/config.js";
import { secureFetch } from "../core/api.js";

// --- 1. INITIALISATION DU CRM ---
export async function initCRM() {
    try {
        Swal.fire({ title: 'Chargement CRM...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        // On charge les Leads ET la Configuration des champs dynamiques
        const [resLeads, resFields] = await Promise.all([
            secureFetch(`${SIRH_CONFIG.apiBaseUrl}/leads`),
            secureFetch(`${SIRH_CONFIG.apiBaseUrl}/crm-fields`)
        ]);

        AppState.crmLeads = await resLeads.json();
        AppState.crmFields = await resFields.json();

        renderKanban();
        initDragAndDrop();
        Swal.close();
    } catch (e) {
        console.error("Erreur CRM:", e);
        Swal.fire("Erreur", "Impossible de charger le CRM", "error");
    }
}

 /**
 * Rendu complet du Kanban CRM avec Calcul de Valeur et Graphique
 */
/**
 * Rendu dynamique du Pipeline CRM (Kanban Haute Performance)
 */
export async function renderKanban() {
    const boardContainer = document.querySelector('#view-crm .flex.gap-6');
    if (!boardContainer) return;

    // 1. CHARGEMENT DES ÉTAPES (STAGES) DEPUIS LE SERVEUR
    const resStages = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/stages`);
    const stages = await resStages.json();
    AppState.crmStages = stages;

    // Nettoyage du board
    boardContainer.innerHTML = '';

    // Variables pour les statistiques globales
    let totalValue = 0;
    let stageStats = {}; // Format: { "Stage Name": { count: 0, value: 0, color: "" } }

    // 2. CRÉATION DYNAMIQUE DES COLONNES
    stages.forEach(stage => {
        stageStats[stage.label] = { count: 0, value: 0, color: stage.color, id: stage.id };

        const colHtml = `
            <div class="w-80 flex flex-col h-full animate-fadeIn">
                <!-- En-tête de colonne stylisé -->
                <div class="flex justify-between items-center p-3 rounded-t-2xl border border-b-0" 
                     style="background-color: ${stage.color}10; border-color: ${stage.color}30">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full" style="background-color: ${stage.color}"></div>
                        <span class="font-black text-[10px] uppercase tracking-widest" style="color: ${stage.color}">${stage.label}</span>
                    </div>
                    <span id="count-${stage.id}" class="bg-white text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm border border-slate-100">0</span>
                </div>

                <!-- Zone de dépôt (Sortable) -->
                <div id="kanban-${stage.id}" data-status="${stage.label}" 
                     class="kanban-col flex-1 bg-slate-50/30 border border-slate-200 rounded-b-2xl p-3 space-y-3 overflow-y-auto custom-scroll min-h-[250px]">
                    <!-- Les cartes seront injectées ici -->
                </div>

                <!-- Pied de colonne : Total Financier -->
                <div class="p-2 text-right">
                    <span id="value-${stage.id}" class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">0 F</span>
                </div>
            </div>
        `;
        boardContainer.insertAdjacentHTML('beforeend', colHtml);
    });

    // 3. DISTRIBUTION DES LEADS DANS LES COLONNES
    const today = new Date().toISOString().split('T')[0];

    AppState.crmLeads.forEach(lead => {
        // On trouve la colonne correspondante
        const stage = stages.find(s => s.label === lead.status) || stages[0];
        const colBody = document.getElementById(`kanban-${stage.id}`);

        if (colBody) {
            // Détection intelligente du budget
            let leadValue = 0;
            if (lead.data) {
                for (let key in lead.data) {
                    const k = key.toLowerCase();
                    if (k.includes('budget') || k.includes('montant') || k.includes('ca') || k.includes('valeur')) {
                        leadValue = parseFloat(lead.data[key]) || 0;
                        break;
                    }
                }
            }

            // Mise à jour des stats
            stageStats[stage.label].count++;
            stageStats[stage.label].value += leadValue;
            totalValue += leadValue;

            // Création de la carte avec gestion des retards de relance
            const nextRelance = lead.data.date_relance;
            const isLate = nextRelance && nextRelance < today;

            const card = createLeadCard(lead, leadValue, isLate);
            colBody.appendChild(card);
        }
    });

    // 4. MISE À JOUR DES COMPTEURS ET VALEURS DE COLONNES
    stages.forEach(stage => {
        const stats = stageStats[stage.label];
        const countEl = document.getElementById(`count-${stage.id}`);
        const valueEl = document.getElementById(`value-${stage.id}`);
        if (countEl) countEl.innerText = stats.count;
        if (valueEl) valueEl.innerText = new Intl.NumberFormat('fr-FR').format(stats.value) + ' F';
    });

    // 5. RENDU DU DASHBOARD GLOBAL (Cartes KPI + Graphique)
    renderCrmDashboard(totalValue, stageStats, stages);

    // 6. RÉINITIALISATION DU DRAG & DROP
    initDragAndDrop();
}

/**
 * Helper : Création d'une carte Lead stylisée (Style Odoo/SaaS)
 */
function createLeadCard(lead, value, isLate) {
    const initial = lead.nom_client ? lead.nom_client.charAt(0).toUpperCase() : '?';
    const dateMaj = new Date(lead.updated_at || lead.created_at).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'});
    
    const card = document.createElement('div');
    card.className = `bg-white p-4 rounded-xl border-2 ${isLate ? 'border-red-100 bg-red-50/5' : 'border-transparent'} shadow-sm hover:shadow-md transition-all active:cursor-grabbing cursor-grab relative group animate-fadeIn`;
    card.dataset.id = lead.id;

    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black border border-slate-700 shadow-sm">${initial}</div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="window.openLeadModal('${lead.id}')" class="p-1.5 text-slate-400 hover:text-blue-600 transition-colors" title="Ouvrir"><i class="fa-solid fa-expand"></i></button>
                <button onclick="window.deleteLead('${lead.id}')" class="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        </div>
        
        <h4 class="font-black text-xs text-slate-800 leading-tight mb-2 truncate" title="${lead.nom_client}">${lead.nom_client}</h4>
        
        <div class="flex justify-between items-center mb-3">
            <span class="text-[10px] font-black ${isLate ? 'text-red-500' : 'text-emerald-600'}">
                ${value > 0 ? new Intl.NumberFormat('fr-FR').format(value) + ' F' : '---'}
            </span>
            ${(lead.data.files && lead.data.files.length > 0) ? '<i class="fa-solid fa-paperclip text-[10px] text-slate-300"></i>' : ''}
        </div>

        <div class="pt-3 border-t border-slate-50 flex justify-between items-center">
            <span class="text-[8px] text-slate-300 font-medium italic">Maj: ${dateMaj}</span>
            ${isLate ? '<span class="text-[8px] font-black text-red-500 uppercase animate-pulse"><i class="fa-solid fa-clock"></i> RETARD</span>' : ''}
        </div>
    `;
    return card;
}

/**
 * Helper : Rendu du Dashboard Financier et Graphique Dynamique
 */
function renderCrmDashboard(totalValue, stageStats, stages) {
    let dashContainer = document.getElementById('crm-dashboard-stats');
    if (!dashContainer) {
        dashContainer = document.createElement('div');
        dashContainer.id = 'crm-dashboard-stats';
        dashContainer.className = "grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-fadeIn";
        document.getElementById('view-crm').insertBefore(dashContainer, document.querySelector('.flex-1.overflow-x-auto'));
    }

    const fmt = (val) => new Intl.NumberFormat('fr-FR').format(val) + ' F';
    
    // Identification de l'étape "Gagné" pour le KPI de droite
    const wonStage = stages.find(s => s.label.toLowerCase().includes('gagn')) || { label: 'Gagné' };
    const wonValue = stageStats[wonStage.label]?.value || 0;

    dashContainer.innerHTML = `
        <div class="bg-slate-900 p-5 rounded-[1.5rem] text-white shadow-xl relative overflow-hidden group">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest relative z-10">Valeur Totale Pipeline</p>
            <h3 class="text-2xl font-black mt-1 relative z-10">${fmt(totalValue)}</h3>
            <i class="fa-solid fa-vault absolute -right-2 -bottom-2 text-5xl opacity-10 group-hover:scale-110 transition-transform"></i>
        </div>
        <div class="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dossiers Actifs</p>
            <h3 class="text-2xl font-black text-blue-600 mt-1">${AppState.crmLeads.length}</h3>
            <i class="fa-solid fa-briefcase absolute -right-2 -bottom-2 text-5xl text-slate-50 group-hover:rotate-12 transition-transform"></i>
        </div>
        <div class="bg-emerald-500 p-5 rounded-[1.5rem] text-white shadow-lg shadow-emerald-200 relative overflow-hidden group">
            <p class="text-[9px] font-black text-emerald-100 uppercase tracking-widest">Chiffre Gagné</p>
            <h3 class="text-2xl font-black mt-1">${fmt(wonValue)}</h3>
            <i class="fa-solid fa-trophy absolute -right-2 -bottom-2 text-5xl opacity-20 group-hover:-rotate-12 transition-transform"></i>
        </div>
    `;

    // Graphique Chart.js
    let chartArea = document.getElementById('crm-chart-area');
    if (!chartArea) {
        chartArea = document.createElement('div');
        chartArea.id = 'crm-chart-area';
        chartArea.className = "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm mb-8 animate-fadeIn";
        chartArea.innerHTML = `<div style="height: 200px;"><canvas id="crmDynamicChart"></canvas></div>`;
        document.getElementById('view-crm').insertBefore(chartArea, document.querySelector('.flex-1.overflow-x-auto'));
    }

    const ctx = document.getElementById('crmDynamicChart').getContext('2d');
    if (window.myCrmChart) window.myCrmChart.destroy();

    window.myCrmChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stages.map(s => s.label),
            datasets: [{
                data: stages.map(s => stageStats[s.label]?.value || 0),
                backgroundColor: stages.map(s => s.color + 'CC'),
                borderColor: stages.map(s => s.color),
                borderWidth: 2,
                borderRadius: 8,
                barThickness: 45
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { display: false } },
                x: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' } } }
            }
        }
    });
}
// --- 3. LE GLISSER-DÉPOSER (SORTABLE.JS) ---
export function initDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-col');
    columns.forEach(col => {
        new Sortable(col, {
            group: 'kanban', // Permet de passer d'une colonne à l'autre
            animation: 150,
            ghostClass: 'opacity-30', // Style de la carte fantôme pendant le drag
            onEnd: async function (evt) {
                const itemEl = evt.item;
                const leadId = itemEl.dataset.id;
                const newStatus = evt.to.dataset.status;

                // Si on a changé de colonne, on met à jour la base de données silencieusement
                if (evt.from !== evt.to) {
                    try {
                        await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/save-lead`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: leadId, status: newStatus })
                        });
                        // Met à jour la mémoire et les compteurs
                        const lead = AppState.crmLeads.find(l => l.id === leadId);
                        if (lead) lead.status = newStatus;
                        renderKanban(); 
                    } catch(e) {
                        console.error("Erreur Drag Drop:", e);
                        initCRM(); // Si ça plante, on recharge pour annuler l'erreur visuelle
                    }
                }
            }
        });
    });
}




/**
 * Ouvre la fiche complète d'un prospect (Edition / Historique / Documents)
 */
export async function openLeadModal(id = null) {
    // 1. Initialisation des données
    const lead = id ? AppState.crmLeads.find(l => l.id === id) : { 
        nom_client: '', 
        status: 'Nouveau', 
        assigned_to: null, 
        data: { files: [] }, 
        history: [] 
    };

    // 2. Génération de la liste des commerciaux (Employés) pour l'assignation
    const employees = AppState.employees || [];
    const assignmentHtml = `
        <div class="mb-6">
            <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Commercial Assigné</label>
            <select id="crm-assign" class="w-full p-3 bg-white border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all">
                <option value="">-- Non assigné --</option>
                ${employees.map(e => `<option value="${e.id}" ${lead.assigned_to === e.id ? 'selected' : ''}>${e.nom}</option>`).join('')}
            </select>
        </div>
    `;

    // 3. Génération des champs dynamiques (No-Code)
    let dynamicHtml = '';
    const fields = AppState.crmFields || [];
    fields.forEach(f => {
        const val = (lead.data && lead.data[f.key_name]) || '';
        let widget = '';

        if (f.field_type === 'select') {
            const opts = f.options || [];
            widget = `<select id="dyn-${f.key_name}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                <option value="">-- Choisir --</option>
                ${opts.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>`;
        } else if (f.field_type === 'date') {
            widget = `<input type="date" id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">`;
        } else if (f.field_type === 'number') {
            widget = `<input type="number" id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" placeholder="0">`;
        } else {
            widget = `<input type="text" id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" placeholder="${f.label}">`;
        }

        dynamicHtml += `
            <div class="mb-4">
                <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">${f.label}</label>
                ${widget}
            </div>`;
    });

    // 4. Génération de la liste des documents joints
    const files = (lead.data && lead.data.files) || [];
    const filesHtml = files.map(file => {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(file.name);
        return `
            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2 group hover:bg-white hover:border-blue-200 transition-all">
                <div class="flex items-center gap-3 overflow-hidden">
                    <i class="fa-solid ${isImg ? 'fa-file-image text-blue-500' : 'fa-file-pdf text-red-500'}"></i>
                    <a href="${file.url}" target="_blank" class="text-[10px] font-black text-slate-700 truncate hover:text-blue-600">${file.name}</a>
                </div>
                <span class="text-[8px] text-slate-300 font-mono">${file.size || ''}</span>
            </div>`;
    }).join('');

    // 5. Affichage de la Modale Split-View
    Swal.fire({
        title: null,
        width: '1200px',
        customClass: { popup: 'rounded-[2.5rem] p-0 overflow-hidden' },
        showConfirmButton: false,
        showCloseButton: true,
        html: `
            <div class="flex flex-col md:flex-row h-[85vh] max-h-[800px] text-left bg-white">
                
                <!-- GAUCHE : INFOS & CHAMPS (40%) -->
                <div class="w-full md:w-[40%] p-10 border-r border-slate-100 overflow-y-auto custom-scroll">
                    <div class="flex items-center gap-4 mb-8">
                        <div class="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-2xl font-black shadow-lg">
                            ${lead.nom_client ? lead.nom_client.charAt(0).toUpperCase() : '+'}
                        </div>
                        <div>
                            <h2 class="text-2xl font-black text-slate-800 uppercase tracking-tight">${lead.nom_client || 'Nouveau Lead'}</h2>
                            <div class="flex gap-2 mt-1">
                                <span class="px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-[9px] font-black uppercase">${lead.status}</span>
                                ${lead.data.telephone ? `<button onclick="window.open('https://wa.me/${lead.data.telephone.replace(/\s/g, '')}')" class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-600 text-[9px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all"><i class="fa-brands fa-whatsapp mr-1"></i> WhatsApp</button>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Champ Principal -->
                    <div class="mb-8">
                        <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nom du Client / Entreprise *</label>
                        <input id="crm-nom" value="${lead.nom_client}" class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black outline-none focus:border-blue-500 shadow-inner">
                    </div>

                    <!-- Assignation -->
                    ${assignmentHtml}

                    <!-- Champs Dynamiques -->
                    <div class="space-y-2 mb-8">${dynamicHtml}</div>

                    <!-- Documents -->
                    <div class="mt-10 pt-8 border-t border-slate-100">
                        <div class="flex justify-between items-center mb-4">
                            <p class="text-[10px] font-black text-slate-900 uppercase tracking-widest">Documents & Pièces Jointes</p>
                            <button onclick="window.uploadCrmFile('${id}')" class="text-blue-600 font-black text-[9px] uppercase hover:underline">+ Ajouter</button>
                        </div>
                        ${filesHtml || '<p class="text-[9px] text-slate-300 italic text-center py-4 border-2 border-dashed rounded-xl">Aucun document</p>'}
                    </div>

                    <button onclick="window.saveLeadData('${id || ''}')" class="w-full mt-10 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all active:scale-95">
                        <i class="fa-solid fa-floppy-disk mr-2"></i> Enregistrer la fiche
                    </button>
                </div>

                <!-- DROITE : TIMELINE D'INTERACTIONS (60%) -->
                <div class="flex-1 bg-slate-50/50 flex flex-col h-full">
                    <div class="bg-white p-5 border-b border-slate-200 flex justify-between items-center">
                        <span class="text-[10px] font-black uppercase text-slate-400 tracking-widest"><i class="fa-solid fa-clock-rotate-left mr-2"></i> Historique des échanges</span>
                        ${id ? `<button onclick="window.deleteLead('${id}')" class="text-red-300 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                    </div>

                    <div class="flex-1 p-8 overflow-y-auto custom-scroll space-y-4">
                        ${renderHistoryWall(lead.history || [])}
                    </div>

                    <!-- Saisie rapide -->
                    <div class="p-6 bg-white border-t border-slate-200">
                        <div class="flex gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-inner">
                            <select id="interaction-type" class="bg-transparent border-none text-[10px] font-black uppercase outline-none px-2 text-slate-500">
                                <option value="NOTE">📝 Note</option>
                                <option value="APPEL">📞 Appel</option>
                                <option value="EMAIL">📧 Email</option>
                            </select>
                            <input id="interaction-text" class="flex-1 bg-transparent border-none text-sm outline-none py-2" placeholder="Notez votre dernier échange...">
                            <button onclick="window.addInteraction('${id}')" class="w-12 h-12 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-blue-600 transition-all flex items-center justify-center"><i class="fa-solid fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
            </div>`
    });
}

/**
 * Fonction Helper pour le rendu de la Timeline (Historique)
 */
function renderHistoryWall(history) {
    if (!history || history.length === 0) {
        return `<div class="text-center py-20 opacity-20"><i class="fa-solid fa-comments text-5xl"></i><p class="text-[10px] font-black uppercase mt-4">Aucune interaction tracée</p></div>`;
    }
    return history.slice().reverse().map(h => {
        let icon = "fa-note-sticky text-slate-400";
        let bg = "bg-white";
        if(h.type === 'APPEL') { icon = "fa-phone text-emerald-500"; bg = "bg-emerald-50/30"; }
        if(h.type === 'EMAIL') { icon = "fa-envelope text-blue-500"; bg = "bg-blue-50/30"; }
        
        const dateStr = new Date(h.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        return `
            <div class="p-4 rounded-2xl border border-slate-100 ${bg} shadow-sm animate-fadeIn">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[9px] font-black text-slate-500 uppercase"><i class="fa-solid ${icon} mr-1"></i> ${h.type}</span>
                    <span class="text-[8px] font-bold text-slate-300">${dateStr}</span>
                </div>
                <p class="text-xs text-slate-700 leading-relaxed font-medium">${h.content}</p>
                <p class="text-[8px] font-black text-slate-400 mt-2 uppercase">Par ${h.author}</p>
            </div>`;
    }).join('');
}


// --- 5. SAUVEGARDE DU FORMULAIRE ---
export async function saveLeadData(id) {
    const nomClient = document.getElementById('crm-nom').value;
    if (!nomClient) return Swal.showValidationMessage("Le nom est obligatoire");

    // On parcourt les champs dynamiques pour construire le JSONB
    const dynamicData = {};
    AppState.crmFields.forEach(f => {
        const el = document.getElementById(`dyn-${f.key_name}`);
        if (el) dynamicData[f.key_name] = el.value;
    });

    Swal.fire({ title: 'Sauvegarde...', didOpen: () => Swal.showLoading() });

    try {
        await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/save-lead`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id || null,
                nom_client: nomClient,
                ...dynamicData
            })
        });
        Swal.close();
        initCRM(); // Recharge tout le Kanban
    } catch(e) {
        Swal.fire("Erreur", e.message, "error");
    }
}

// --- AJOUTER INTERACTION OU ENVOYER EMAIL ---
// --- 6. AJOUTER UNE INTERACTION (Note, Appel, etc.) ---
export async function addInteraction(leadId) {
    const text = document.getElementById('interaction-text').value;
    const type = document.getElementById('interaction-type').value;

    // 💥 FIX : On doit récupérer les données du prospect pour avoir son email
    const lead = AppState.crmLeads.find(l => l.id === leadId);

    if (type === 'EMAIL') {
        const { value: emailData } = await Swal.fire({
            title: 'Rédiger un message',
            html: `
                <div class="text-left">
                    <label class="text-[10px] font-black text-slate-400 uppercase ml-1">Destinataire</label>
                    <input id="swal-mail-to" class="swal2-input !mt-1" value="${(lead && lead.data) ? (lead.data.email || '') : ''}" placeholder="email@client.com">
                    
                    <label class="text-[10px] font-black text-slate-400 uppercase ml-1 mt-4 block">Sujet</label>
                    <input id="swal-mail-sub" class="swal2-input !mt-1" placeholder="Ex: Suite à notre rencontre...">
                </div>
            `,
            confirmButtonText: 'Envoyer maintenant',
            showCancelButton: true,
            confirmButtonColor: '#0f172a',
            preConfirm: () => {
                const to = document.getElementById('swal-mail-to').value;
                const sub = document.getElementById('swal-mail-sub').value;
                if (!to || !sub) {
                    Swal.showValidationMessage('Email et Sujet obligatoires');
                    return false;
                }
                return { to, subject: sub, content: text };
            }
        });

        if (emailData) {
            Swal.fire({ title: 'Expédition...', didOpen: () => Swal.showLoading() });
            try {
                await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/send-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        lead_id: leadId, 
                        to_email: emailData.to, 
                        subject: emailData.subject, 
                        content: emailData.content, 
                        agent_name: AppState.currentUser.nom 
                    })
                });
                Swal.fire("Envoyé !", "Le mail est parti et a été tracé dans l'historique.", "success");
                initCRM().then(() => openLeadModal(leadId));
            } catch(e) { 
                Swal.fire("Erreur", "L'envoi a échoué. Vérifiez vos clés API Brevo.", "error"); 
            }
        }
    } else {
        // Logique Note/Appel classique
        if (!text) return;
        try {
            await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/add-interaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: leadId,
                    type: type,
                    content: text,
                    agent_name: AppState.currentUser.nom
                })
            });
            // Recharger pour voir la nouvelle note
            initCRM().then(() => openLeadModal(leadId));
        } catch(e) {
            Swal.fire("Erreur", "Impossible d'ajouter la note", "error");
        }
    }
}

// ============================================================
// 7. LE "NO-CODE BUILDER" (Configuration des champs)
// ============================================================
export async function openCrmSettings() {
    // 1. Sécurité : Seul un Admin peut modifier la structure
    if (!AppState.currentUser.permissions.can_manage_config) {
        return Swal.fire("Accès refusé", "Seul un administrateur peut configurer le CRM.", "error");
    }

    // 2. Affichage des champs existants
    let fieldsHtml = '';
    if (AppState.crmFields && AppState.crmFields.length > 0) {
        fieldsHtml = AppState.crmFields.map(f => `
            <div class="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl mb-2 shadow-sm">
                <div>
                    <span class="font-bold text-xs text-slate-800">${f.label}</span>
                    <span class="text-[9px] text-slate-400 font-mono ml-2">(${f.key_name}) ${f.field_type === 'select' ? '🔘' : ''}</span>
                </div>
                <span class="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-100">${f.field_type}</span>
            </div>
        `).join('');
    } else {
        fieldsHtml = '<div class="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 text-xs italic">Aucun champ personnalisé créé.</div>';
    }

    // 3. Modale de Configuration Premium
    Swal.fire({
        title: '<div class="text-left text-xl font-black uppercase tracking-tight text-slate-800"><i class="fa-solid fa-sliders text-sky-500 mr-2"></i> Configuration CRM</div>',
        html: `
            <div class="text-left mt-4">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Champs Actuels</p>
                <div class="max-h-48 overflow-y-auto custom-scroll pr-2 mb-6 bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    ${fieldsHtml}
                </div>

                <div class="p-6 bg-sky-50 rounded-2xl border border-sky-100 relative overflow-hidden">
                    <i class="fa-solid fa-wand-magic-sparkles absolute -right-4 -bottom-4 text-6xl text-sky-500 opacity-10"></i>
                    
                    <p class="text-[10px] font-black text-sky-600 uppercase tracking-widest mb-4 relative z-10">Créer une nouvelle colonne</p>
                    
                    <div class="relative z-10 space-y-4">
                        <div>
                            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Nom (ex: Source du Lead)</label>
                            <input id="new-field-label" class="w-full p-3 bg-white border border-sky-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-sky-500 shadow-sm" placeholder="Nom du champ...">
                        </div>
                        
                        <div>
                            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Type de donnée</label>
                            <select id="new-field-type" onchange="window.toggleOptionsInput(this.value)" class="w-full p-3 bg-white border border-sky-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-sky-500 shadow-sm cursor-pointer">
                                <option value="text">Texte libre</option>
                                <option value="number">Nombre / Budget</option>
                                <option value="date">Date / RDV</option>
                                <option value="select">🔘 Menu Déroulant (Sélecteur)</option>
                            </select>
                        </div>

                        <!-- 💥 ZONE DYNAMIQUE POUR LES OPTIONS 💥 -->
                        <div id="options-config-area" class="hidden animate-fadeIn space-y-2">
                            <label class="block text-[9px] font-black text-orange-600 uppercase mb-1 ml-1">Choix du menu (séparés par des virgules)</label>
                            <textarea id="new-field-options" rows="2" class="w-full p-3 bg-white border border-orange-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-orange-400 shadow-sm" placeholder="Ex: Client VIP, Prospect, Litige..."></textarea>
                            <p class="text-[8px] text-slate-400 italic">Le système créera un bouton pour chaque choix.</p>
                        </div>

                        <button onclick="window.saveCrmField()" class="w-full py-4 mt-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-sky-500 transition-all active:scale-95">
                            Ajouter ce champ au CRM
                        </button>
                    </div>
                </div>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: '600px',
        customClass: { popup: 'rounded-[2rem]' }
    });
}



export async function saveCrmField() {
    const label = document.getElementById('new-field-label').value.trim();
    const type = document.getElementById('new-field-type').value;

    if (!label) {
        // Animation d'erreur sur l'input
        const input = document.getElementById('new-field-label');
        input.classList.add('ring-2', 'ring-red-500', 'border-red-500');
        setTimeout(() => input.classList.remove('ring-2', 'ring-red-500', 'border-red-500'), 1500);
        return;
    }

    // 1. Formatage magique de la clé (Ex: "Budget Estimé" devient "budget_estime")
    const key_name = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');

    Swal.fire({ title: 'Génération du champ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/save-crm-field`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, key_name, field_type: type })
        });

        if (response.ok) {
            Swal.fire({
                icon: 'success', title: 'Champ Créé !', 
                text: `La colonne "${label}" est maintenant disponible sur toutes les fiches clients.`,
                confirmButtonColor: '#0ea5e9'
            }).then(() => {
                // On recharge le CRM pour actualiser les données en mémoire
                initCRM();
            });
        } else {
            const err = await response.json();
            throw new Error(err.error || "Erreur serveur");
        }
    } catch (e) {
        Swal.fire("Erreur", e.message, "error");
    }
}



function createLeadCard(lead, value) {
    const dateMaj = new Date(lead.updated_at || lead.created_at).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'});
    const initial = lead.nom_client ? lead.nom_client.charAt(0).toUpperCase() : '?';
    
    // --- LOGIQUE DE RELANCE ---
    const nextRelance = lead.data.date_relance; // On cherche cette clé dans le JSONB
    let relanceHtml = '';
    let isOverdue = false;

    if (nextRelance) {
        const today = new Date().toISOString().split('T')[0];
        isOverdue = nextRelance < today;
        const dateFmt = new Date(nextRelance).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
        
        relanceHtml = `
            <div class="flex items-center gap-1.5 ${isOverdue ? 'text-red-500 animate-pulse' : 'text-slate-400'}">
                <i class="fa-regular fa-clock text-[10px]"></i>
                <span class="text-[9px] font-black uppercase">${isOverdue ? 'Retard' : 'Relance'} : ${dateFmt}</span>
            </div>
        `;
    }

    const card = document.createElement('div');
    // Si en retard, on ajoute une bordure rouge discrète
    card.className = `bg-white p-4 rounded-xl border-2 ${isOverdue ? 'border-red-100 bg-red-50/10' : 'border-slate-100'} shadow-sm cursor-grab hover:shadow-md transition-all active:cursor-grabbing relative group animate-fadeIn`;
    card.dataset.id = lead.id;
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">${initial}</div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="window.openLeadModal('${lead.id}')" class="p-1.5 text-slate-400 hover:text-blue-600"><i class="fa-solid fa-pen-to-square text-[10px]"></i></button>
            <button onclick="window.deleteLead('${lead.id}')" class="p-1.5 text-slate-400 hover:text-red-500 transition-all">
                <i class="fa-solid fa-trash-can text-[10px]"></i>
            </button>
            </div>
        </div>
        
        <h4 class="font-black text-xs text-slate-800 leading-tight mb-2 truncate">${lead.nom_client}</h4>
        
        <div class="flex justify-between items-center mb-3">
            <span class="text-[10px] font-black text-emerald-600">${value > 0 ? new Intl.NumberFormat('fr-FR').format(value) + ' F' : ''}</span>
            ${lead.data.files ? '<i class="fa-solid fa-paperclip text-[10px] text-slate-300"></i>' : ''}
        </div>

        <div class="pt-3 border-t border-slate-50 flex justify-between items-center">
            <span class="text-[8px] text-slate-300 font-medium italic">Maj: ${dateMaj}</span>
            ${relanceHtml}
        </div>
    `;
    return card;
}

/**
 * Ouvre le sélecteur de fichier et l'envoie au serveur pour ce lead
 */
export async function uploadCrmFile(leadId) {
    if (!leadId || leadId === 'null') {
        return Swal.fire("Attention", "Veuillez d'abord enregistrer le prospect avant d'ajouter des fichiers.", "warning");
    }

    const { value: file } = await Swal.fire({
        title: 'Sélectionner un document',
        text: 'Format accepté : Images, PDF (Max 5 Mo)',
        input: 'file',
        inputAttributes: {
            'accept': 'image/*,application/pdf',
            'aria-label': 'Uploader votre document'
        },
        showCancelButton: true,
        confirmButtonText: 'Lancer l\'upload',
        confirmButtonColor: '#0f172a'
    });

    if (file) {
        Swal.fire({
            title: 'Envoi en cours...',
            html: '<i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-2xl"></i>',
            showConfirmButton: false,
            allowOutsideClick: false
        });

        const fd = new FormData();
        fd.append('lead_id', leadId);
        fd.append('crm_file', file);
        fd.append('agent_name', AppState.currentUser.nom);

        try {
            const response = await fetch(`${SIRH_CONFIG.apiBaseUrl}/upload-lead-file`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem("sirh_token")}` },
                body: fd
            });

            if (response.ok) {
                Swal.fire("Succès", "Le document a été archivé dans la fiche client.", "success");
                // On rafraîchit les données pour voir le fichier apparaître
                initCRM().then(() => openLeadModal(leadId));
            } else {
                throw new Error("Erreur lors de l'upload");
            }
        } catch (e) {
            Swal.fire("Erreur", e.message, "error");
        }
    }
}





/**
 * Génère le dashboard financier dynamique en haut du CRM
 */
function renderCrmDashboard(totalValue, stageStats, stages) {
    // 1. GESTION DES CARTES DE RÉSUMÉ (KPIs)
    let dashContainer = document.getElementById('crm-dashboard-stats');
    if (!dashContainer) {
        dashContainer = document.createElement('div');
        dashContainer.id = 'crm-dashboard-stats';
        dashContainer.className = "grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-fadeIn";
        document.getElementById('view-crm').insertBefore(dashContainer, document.querySelector('.flex-1.overflow-x-auto'));
    }

    const fmt = (val) => new Intl.NumberFormat('fr-FR').format(val) + ' F';
    
    // On identifie spécifiquement la valeur de l'étape "Gagné" pour le KPI de droite
    const wonStage = stages.find(s => s.label.toLowerCase().includes('gagn')) || { label: 'Gagné' };
    const wonValue = stageStats[wonStage.label]?.value || 0;

    dashContainer.innerHTML = `
        <div class="bg-slate-900 p-5 rounded-[1.5rem] text-white shadow-xl relative overflow-hidden group">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest relative z-10">Valeur Totale Pipeline</p>
            <h3 class="text-2xl font-black mt-1 relative z-10">${fmt(totalValue)}</h3>
            <i class="fa-solid fa-vault absolute -right-2 -bottom-2 text-5xl opacity-10 group-hover:scale-110 transition-transform"></i>
        </div>
        <div class="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opportunités Actives</p>
            <h3 class="text-2xl font-black text-blue-600 mt-1">${AppState.crmLeads.length} <span class="text-xs text-slate-300 font-bold">Dossiers</span></h3>
            <i class="fa-solid fa-briefcase absolute -right-2 -bottom-2 text-5xl text-slate-50 group-hover:rotate-12 transition-transform"></i>
        </div>
        <div class="bg-emerald-500 p-5 rounded-[1.5rem] text-white shadow-lg shadow-emerald-200 relative overflow-hidden group">
            <p class="text-[9px] font-black text-emerald-100 uppercase tracking-widest">Chiffre d'Affaires Gagné</p>
            <h3 class="text-2xl font-black mt-1">${fmt(wonValue)}</h3>
            <i class="fa-solid fa-trophy absolute -right-2 -bottom-2 text-5xl opacity-20 group-hover:-rotate-12 transition-transform"></i>
        </div>
    `;

    // 2. GESTION DU GRAPHIQUE BARRE DYNAMIQUE
    let chartArea = document.getElementById('crm-chart-area');
    if (!chartArea) {
        chartArea = document.createElement('div');
        chartArea.id = 'crm-chart-area';
        chartArea.className = "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm mb-8 animate-fadeIn";
        chartArea.innerHTML = `
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Répartition financière par étape</p>
            <div style="height: 220px;"><canvas id="crmDynamicChart"></canvas></div>
        `;
        document.getElementById('view-crm').insertBefore(chartArea, document.querySelector('.flex-1.overflow-x-auto'));
    }

    const ctx = document.getElementById('crmDynamicChart').getContext('2d');
    if (window.myCrmChart) window.myCrmChart.destroy();

    // On prépare les données du graphique en fonction des étapes réelles
    const labels = stages.map(s => s.label);
    const dataValues = stages.map(s => stageStats[s.label]?.value || 0);
    const colors = stages.map(s => s.color || '#94a3b8');

    window.myCrmChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: colors.map(c => c + 'CC'), // 80% opacité
                borderColor: colors,
                borderWidth: 2,
                borderRadius: 8,
                barThickness: 45
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    callbacks: {
                        label: (context) => ` Valeur: ${new Intl.NumberFormat('fr-FR').format(context.raw)} F`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } }
            }
        }
    });
}








export async function deleteLead(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'Supprimer ce prospect ?',
        text: "Cette action est irréversible et effacera l'historique.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Oui, supprimer'
    });

    if (isConfirmed) {
        try {
            await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/delete-lead`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            initCRM(); // Recharge le Kanban
        } catch(e) { Swal.fire("Erreur", e.message, "error"); }
    }
}
// Affiche ou cache le champ des options selon le type choisi
window.toggleOptionsInput = (type) => {
    const area = document.getElementById('options-config-area');
    if (type === 'select') area.classList.remove('hidden');
    else area.classList.add('hidden');
};

