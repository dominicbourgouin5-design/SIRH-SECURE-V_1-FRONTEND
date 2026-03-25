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

export async function openLeadModal(id = null) {
    const lead = id ? AppState.crmLeads.find(l => l.id === id) : { data: {}, history: [] };
    
    // 1. GÉNÉRATION DES CHAMPS PROFESSIONNELS
    let dynamicHtml = '';
    AppState.crmFields.forEach(f => {
        const val = lead.data[f.key_name] || '';
        let fieldWidget = '';

        // Widget dynamique selon le type
        if (f.field_type === 'select') {
            const opts = f.options || [];
            fieldWidget = `<select id="dyn-${f.key_name}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                <option value="">-- Choisir --</option>
                ${opts.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>`;
        } else if (f.field_type === 'date') {
            fieldWidget = `<input type="date" id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">`;
        } else {
            // Par défaut : Texte avec icône de copie
            fieldWidget = `
                <div class="relative">
                    <input id="dyn-${f.key_name}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold pr-10">
                    <button onclick="navigator.clipboard.writeText('${val}')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-blue-500"><i class="fa-solid fa-copy"></i></button>
                </div>`;
        }

        dynamicHtml += `
            <div class="mb-4">
                <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">${f.label}</label>
                ${fieldWidget}
            </div>
        `;
    });

    // 2. RENDU DE LA MODALE "DASHBOARD CLIENT"
    Swal.fire({
        title: null,
        width: '1200px', // Très large pour le confort
        customClass: { popup: 'rounded-[2rem] p-0 overflow-hidden' },
        showConfirmButton: false,
        showCloseButton: true,
        html: `
            <div class="flex flex-col md:flex-row h-[750px] text-left bg-white">
                
                <!-- COLONNE 1 : RÉSUMÉ & CHAMPS (40%) -->
                <div class="w-full md:w-[40%] p-10 border-r border-slate-100 overflow-y-auto custom-scroll">
                    <div class="mb-8">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-2xl font-black">${lead.nom_client ? lead.nom_client.charAt(0).toUpperCase() : '+'}</div>
                            <div>
                                <h2 class="text-2xl font-black text-slate-800 uppercase tracking-tight">${lead.nom_client || 'Nouveau Prospect'}</h2>
                                <span class="px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-[10px] font-black uppercase">${lead.status || 'En attente'}</span>
                            </div>
                        </div>
                        <input id="crm-nom" value="${lead.nom_client || ''}" class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black outline-none focus:border-blue-500 mb-6" placeholder="Nom de l'entreprise ou contact...">
                        
                        <div class="space-y-2">
                            ${dynamicHtml}
                        </div>

                        <button onclick="window.saveLeadData('${id || ''}')" class="w-full mt-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all">
                            Sauvegarder les modifications
                        </button>
                    </div>
                </div>

                <!-- COLONNE 2 : CENTRE DE COMMUNICATION (60%) -->
                <div class="flex-1 bg-slate-50/50 flex flex-col h-full">
                    <!-- Tabs de communication -->
                    <div class="flex border-b border-slate-100 bg-white">
                        <button class="flex-1 p-5 text-[10px] font-black uppercase tracking-widest text-blue-600 border-b-2 border-blue-600"><i class="fa-solid fa-clock-rotate-left mr-2"></i> Historique</button>
                        <button class="flex-1 p-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-500"><i class="fa-solid fa-envelope mr-2"></i> Emails</button>
                        <button class="flex-1 p-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-500"><i class="fa-solid fa-comment-dots mr-2"></i> WhatsApp</button>
                    </div>

                    <!-- Flux d'activités -->
                    <div class="flex-1 p-8 overflow-y-auto custom-scroll space-y-4" id="crm-history-wall">
                        ${renderHistoryWall(lead.history)}
                    </div>

                    <!-- Zone de saisie rapide -->
                    <div class="p-6 bg-white border-t border-slate-100">
                        <div class="flex gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-inner">
                            <select id="interaction-type" class="bg-transparent border-none text-[10px] font-black uppercase outline-none px-2 text-slate-500">
                                <option value="NOTE">📝 Note</option>
                                <option value="APPEL">📞 Appel</option>
                                <option value="RDV">🤝 RDV</option>
                            </select>
                            <input id="interaction-text" class="flex-1 bg-transparent border-none text-sm outline-none py-2" placeholder="Taper un compte-rendu...">
                            <button onclick="window.addInteraction('${id}')" class="w-10 h-10 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-blue-600 transition-all"><i class="fa-solid fa-paper-plane"></i></button>
                        </div>
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

// Affiche ou cache le champ des options selon le type choisi
window.toggleOptionsInput = (type) => {
    const area = document.getElementById('options-config-area');
    if (type === 'select') area.classList.remove('hidden');
    else area.classList.add('hidden');
};

