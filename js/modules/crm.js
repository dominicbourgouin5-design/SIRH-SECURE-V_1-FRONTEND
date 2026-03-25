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
export function renderKanban() {
    // 1. INITIALISATION DES COLONNES
    const cols = { 
        'Nouveau': document.getElementById('kanban-nouveau'), 
        'Negociation': document.getElementById('kanban-nego'), 
        'Gagné': document.getElementById('kanban-gagne') 
    };

    // Nettoyage des colonnes avant rendu
    Object.values(cols).forEach(c => { if(c) c.innerHTML = ''; });

    let counts = { 'Nouveau': 0, 'Negociation': 0, 'Gagné': 0 };
    let newValue = 0, negoValue = 0, wonValue = 0;

    // 2. BOUCLE SUR LES LEADS
    AppState.crmLeads.forEach(lead => {
        const col = cols[lead.status] || cols['Nouveau'];
        counts[lead.status] = (counts[lead.status] || 0) + 1;

        // Détection intelligente du montant (cherche les clés 'budget', 'montant', 'ca', 'valeur')
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

        // Accumulation des valeurs par statut
        if (lead.status === 'Gagné') wonValue += leadValue;
        else if (lead.status === 'Negociation') negoValue += leadValue;
        else newValue += leadValue;

        // Construction de la carte HTML
        const date = new Date(lead.updated_at || lead.created_at).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'});
        const initial = lead.nom_client ? lead.nom_client.charAt(0).toUpperCase() : '?';
        const fmtLeadValue = new Intl.NumberFormat('fr-FR').format(leadValue);

        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-xl border border-slate-200 shadow-sm cursor-grab hover:shadow-md transition-all active:cursor-grabbing relative group animate-fadeIn";
        card.dataset.id = lead.id;
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold flex items-center justify-center text-xs border border-slate-200">${initial}</div>
                <button onclick="window.openLeadModal('${lead.id}')" class="text-slate-300 hover:text-blue-500 bg-slate-50 px-2 py-1 rounded transition-colors">
                    <i class="fa-solid fa-expand text-[10px]"></i>
                </button>
            </div>
            <h4 class="font-black text-sm text-slate-800 leading-tight mb-1 truncate" title="${lead.nom_client}">${lead.nom_client}</h4>
            <div class="flex flex-col gap-1">
                ${leadValue > 0 ? `<p class="text-[11px] font-black text-emerald-600">${fmtLeadValue} CFA</p>` : ''}
                <p class="text-[9px] text-slate-400 font-medium flex items-center gap-1">
                    <i class="fa-regular fa-clock"></i> Màj: ${date}
                </p>
            </div>
        `;
        col.appendChild(card);
    });

    // 3. MISE À JOUR DES COMPTEURS DE COLONNES
    if (document.getElementById('count-nouveau')) document.getElementById('count-nouveau').innerText = counts['Nouveau'];
    if (document.getElementById('count-nego')) document.getElementById('count-nego').innerText = counts['Negociation'];
    if (document.getElementById('count-gagne')) document.getElementById('count-gagne').innerText = counts['Gagné'];

    // 4. INJECTION DU DASHBOARD FINANCIER (CARTES)
    let dashContainer = document.getElementById('crm-dashboard-stats');
    if (!dashContainer) {
        dashContainer = document.createElement('div');
        dashContainer.id = 'crm-dashboard-stats';
        dashContainer.className = "grid grid-cols-3 gap-4 mb-6 animate-fadeIn";
        document.getElementById('view-crm').insertBefore(dashContainer, document.querySelector('.flex-1.overflow-x-auto'));
    }
    
    const fmt = (val) => new Intl.NumberFormat('fr-FR').format(val) + ' F';
    dashContainer.innerHTML = `
        <div class="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest relative z-10">Valeur Pipeline</p>
            <h3 class="text-xl font-black text-slate-800 relative z-10">${fmt(newValue + negoValue + wonValue)}</h3>
            <i class="fa-solid fa-chart-line absolute -right-2 -bottom-2 text-4xl text-slate-50 opacity-10 group-hover:scale-110 transition-transform"></i>
        </div>
        <div class="bg-blue-600 p-5 rounded-[1.5rem] text-white shadow-lg shadow-blue-200 relative overflow-hidden group">
            <p class="text-[9px] font-black text-blue-100 uppercase tracking-widest relative z-10">En Négociation</p>
            <h3 class="text-xl font-black relative z-10">${fmt(negoValue)}</h3>
            <i class="fa-solid fa-comments-dollar absolute -right-2 -bottom-2 text-4xl text-white opacity-10 group-hover:rotate-12 transition-transform"></i>
        </div>
        <div class="bg-emerald-500 p-5 rounded-[1.5rem] text-white shadow-lg shadow-emerald-200 relative overflow-hidden group">
            <p class="text-[9px] font-black text-emerald-50 uppercase tracking-widest relative z-10">Chiffre Gagné</p>
            <h3 class="text-xl font-black relative z-10">${fmt(wonValue)}</h3>
            <i class="fa-solid fa-trophy absolute -right-2 -bottom-2 text-4xl text-white opacity-10 group-hover:-rotate-12 transition-transform"></i>
        </div>
    `;

    // 5. INJECTION DU GRAPHIQUE (CHART.JS)
    let chartContainer = document.getElementById('crm-chart-area');
    if (!chartContainer) {
        chartContainer = document.createElement('div');
        chartContainer.id = 'crm-chart-area';
        chartContainer.className = "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm mb-8 animate-fadeIn";
        chartContainer.innerHTML = `
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Répartition de la valeur du Pipeline</p>
            <div style="height: 180px;"><canvas id="crmValueChart"></canvas></div>
        `;
        document.getElementById('view-crm').insertBefore(chartContainer, document.querySelector('.flex-1.overflow-x-auto'));
    }

    const ctx = document.getElementById('crmValueChart').getContext('2d');
    if (window.myCrmChart) window.myCrmChart.destroy();

    window.myCrmChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Nouveaux', 'En Négociation', 'Gagnés'],
            datasets: [{
                data: [newValue, negoValue, wonValue],
                backgroundColor: ['#94a3b8', '#3b82f6', '#10b981'],
                borderRadius: 12,
                barThickness: 50
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { display: false }, ticks: { display: false }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, weight: 'bold' } } }
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

// --- 4. LA FICHE CLIENT (Formulaire Dynamique + Historique) ---
export async function openLeadModal(id = null) {
    const lead = id ? AppState.crmLeads.find(l => l.id === id) : { data: {} };
    const title = id ? lead.nom_client : "Nouveau Prospect";
    
    // GÉNÉRATION DYNAMIQUE DES CHAMPS (Le No-Code !)
    let dynamicHtml = '';
    const fields = AppState.crmFields || [];
    
    fields.forEach(f => {
        const val = lead.data[f.key_name] || '';
        let inputHtml = '';
        
        if (f.field_type === 'text') inputHtml = `<input id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500">`;
        if (f.field_type === 'number') inputHtml = `<input type="number" id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500">`;
        if (f.field_type === 'date') inputHtml = `<input type="date" id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500">`;

        dynamicHtml += `
            <div class="mb-4">
                <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">${f.label}</label>
                ${inputHtml}
            </div>
        `;
    });

    // HISTORIQUE DES INTERACTIONS (Timeline)
    let historyHtml = '<div class="text-center text-slate-400 text-xs italic py-10 border-2 border-dashed rounded-xl">Aucune interaction</div>';
    if (lead.history && lead.history.length > 0) {
        historyHtml = '<div class="space-y-3 max-h-[300px] overflow-y-auto custom-scroll pr-2">';
        lead.history.slice().reverse().forEach(h => {
            const icon = h.type === 'APPEL' ? 'fa-phone text-emerald-500' : (h.type === 'EMAIL' ? 'fa-envelope text-blue-500' : 'fa-note-sticky text-orange-500');
            const dateStr = new Date(h.date).toLocaleDateString('fr-FR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
            historyHtml += `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 flex gap-3 items-start">
                    <i class="fa-solid ${icon} mt-1"></i>
                    <div>
                        <p class="text-[10px] font-bold text-slate-400">${h.author} • ${dateStr}</p>
                        <p class="text-xs text-slate-700 font-medium leading-relaxed mt-1">${h.content}</p>
                    </div>
                </div>
            `;
        });
        historyHtml += '</div>';
    }

    const { value: result } = await Swal.fire({
        title: `<div class="text-left text-xl font-black uppercase text-slate-800">${title}</div>`,
        width: '900px',
        customClass: { popup: 'rounded-[2rem] p-0 overflow-hidden' },
        showConfirmButton: false,
        showCloseButton: true,
        html: `
            <div class="flex flex-col md:flex-row text-left border-t border-slate-100 bg-white min-h-[500px]">
                
                <!-- GAUCHE : LE FORMULAIRE -->
                <div class="w-full md:w-1/2 p-8 border-r border-slate-100">
                    <p class="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-4"><i class="fa-solid fa-address-card"></i> Informations (Éditables)</p>
                    
                    <div class="mb-4">
                        <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nom du Client / Entreprise *</label>
                        <input id="crm-nom" value="${lead.nom_client || ''}" class="w-full p-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:border-sky-500">
                    </div>
                    
                    <!-- INJECTION DES CHAMPS DYNAMIQUES ICI -->
                    ${dynamicHtml}
                    
                    <button onclick="window.saveLeadData('${id || ''}')" class="w-full mt-6 py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-sky-500 transition-all active:scale-95">
                        <i class="fa-solid fa-floppy-disk mr-2"></i> Enregistrer la fiche
                    </button>
                </div>

                <!-- DROITE : HISTORIQUE ET ACTIONS -->
                <div class="w-full md:w-1/2 p-8 bg-slate-50 flex flex-col">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4"><i class="fa-solid fa-clock-rotate-left"></i> Historique des Échanges</p>
                    
                    <!-- Bloc d'ajout d'interaction (Visible uniquement si le lead existe déjà) -->
                    ${id ? `
                        <div class="mb-6 bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex gap-2">
                            <select id="interaction-type" class="bg-slate-50 border-none rounded-lg text-[10px] font-bold outline-none">
                                <option value="NOTE">📝 Note</option>
                                <option value="APPEL">📞 Appel</option>
                                <option value="EMAIL">📧 Email</option>
                            </select>
                            <input id="interaction-text" type="text" class="flex-1 bg-transparent text-xs outline-none" placeholder="Ajouter une trace...">
                            <button onclick="window.addInteraction('${id}')" class="bg-blue-100 text-blue-600 w-8 h-8 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><i class="fa-solid fa-paper-plane text-xs"></i></button>
                        </div>
                    ` : '<p class="text-xs text-orange-500 italic mb-4">Enregistrez d\'abord le prospect pour ajouter des notes.</p>'}

                    <!-- Affichage de la Timeline -->
                    <div class="flex-1">
                        ${historyHtml}
                    </div>
                </div>
            </div>
        `
    });
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

// --- 6. AJOUTER UNE INTERACTION (Note, Appel, etc.) ---
// --- AJOUTER INTERACTION OU ENVOYER EMAIL ---
export async function addInteraction(leadId) {
    const type = document.getElementById('interaction-type').value;
    const text = document.getElementById('interaction-text').value;

if (type === 'EMAIL') {
        const { value: emailData } = await Swal.fire({
            title: 'Rédiger un message',
            html: `
                <div class="text-left">
                    <label class="text-[10px] font-black text-slate-400 uppercase ml-1">Destinataire</label>
                    <input id="swal-mail-to" class="swal2-input !mt-1" value="${lead.data.email || ''}" placeholder="email@client.com">
                    
                    <label class="text-[10px] font-black text-slate-400 uppercase ml-1 mt-4 block">Sujet</label>
                    <input id="swal-mail-sub" class="swal2-input !mt-1" placeholder="Ex: Suite à notre rencontre...">
                </div>
            `,
            confirmButtonText: 'Envoyer maintenant',
            showCancelButton: true,
            preConfirm: () => {
                return {
                    to: document.getElementById('swal-mail-to').value,
                    subject: document.getElementById('swal-mail-sub').value,
                    content: document.getElementById('interaction-text').value // Utilise le texte déjà tapé dans l'input
                }
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
                Swal.fire("Succès", "L'email a été envoyé au client.", "success");
                initCRM().then(() => openLeadModal(leadId));
            } catch(e) { Swal.fire("Erreur", "Échec de l'envoi", "error"); }
        }
    } else {
        // Logique Note/Appel classique
        if (!text) return;
        try {
            await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/add-interaction`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead_id: leadId, type: type, content: text, agent_name: AppState.currentUser.nom })
            });
            initCRM().then(() => openLeadModal(leadId));
        } catch(e) { Swal.fire("Erreur", "Impossible d'ajouter la note", "error"); }
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
                    <span class="text-[9px] text-slate-400 font-mono ml-2">(${f.key_name})</span>
                </div>
                <span class="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-100">${f.field_type}</span>
            </div>
        `).join('');
    } else {
        fieldsHtml = '<div class="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 text-xs italic">Aucun champ personnalisé créé.</div>';
    }

    // 3. Modale de Configuration
    Swal.fire({
        title: '<div class="text-left text-xl font-black uppercase tracking-tight text-slate-800"><i class="fa-solid fa-sliders text-sky-500 mr-2"></i> Configuration CRM</div>',
        html: `
            <div class="text-left mt-4">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Champs Actuels</p>
                <div class="max-h-48 overflow-y-auto custom-scroll pr-2 mb-6 bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    ${fieldsHtml}
                </div>

                <div class="p-6 bg-sky-50 rounded-2xl border border-sky-100 relative overflow-hidden">
                    <!-- Déco visuelle -->
                    <i class="fa-solid fa-wand-magic-sparkles absolute -right-4 -bottom-4 text-6xl text-sky-500 opacity-10"></i>
                    
                    <p class="text-[10px] font-black text-sky-600 uppercase tracking-widest mb-4 relative z-10">Créer une nouvelle colonne</p>
                    
                    <div class="relative z-10 space-y-4">
                        <div>
                            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Nom (ex: Budget Estimé)</label>
                            <input id="new-field-label" class="w-full p-3 bg-white border border-sky-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-sky-500 shadow-sm" placeholder="Nom du champ...">
                        </div>
                        
                        <div>
                            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Type de donnée</label>
                            <select id="new-field-type" class="w-full p-3 bg-white border border-sky-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-sky-500 shadow-sm cursor-pointer">
                                <option value="text">Texte libre (Notes, Ville...)</option>
                                <option value="number">Nombre (Montant, Quantité...)</option>
                                <option value="date">Date (Échéance, RDV...)</option>
                            </select>
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
