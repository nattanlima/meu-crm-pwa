// --- CONFIGURAÇÃO E VARIÁVEIS GLOBAIS ---
const CARDS_TO_SHOW_INITIAL = 30;
const CARDS_TO_LOAD_MORE = 15;
const LIST_ITEMS_INITIAL = 30;
const LIST_ITEMS_MORE = 15;

const loginScreen = document.getElementById('login-screen');
const loadingScreen = document.getElementById('loading-screen');
const crmApp = document.getElementById('crm-app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const kanbanBoard = document.getElementById('kanban-board');
const clientModal = document.getElementById('client-modal');
const modalContent = document.getElementById('modal-content');
const searchInput = document.getElementById('search-input');
const loaderTemplate = document.getElementById('loader-template');
const toast = document.getElementById('toast');

let appData = {
    clients: [], statuses: [], users: [], tags: [],
    client_tags: [], tasks: [], tickets: []
};

let quillEditor = null;
let itemQuillEditor = null;
let currentUser = null;
let deferredPrompt;
let activeTagId = null;
let currentView = 'kanban'; // kanban, list, calendar

let listFilterType = 'all';
let listFilterResponsibleId = 'all';
let currentRenderedListItems = [];
let isFetchingMore = false;

const listView = document.getElementById('list-view');
const calendarView = document.getElementById('calendar-view');
let calendarInstance = null;

// --- FUNÇÕES DE UTILIDADE ---
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('opacity-0', 'translate-y-2');
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
    }, 3000);
}

// --- LÓGICA DE CONFIRMAÇÃO ---
function showConfirmationModal(message, onConfirm) {
    const confirmationModal = document.getElementById('confirmation-modal');
    const messageEl = document.getElementById('confirmation-message');
    const confirmBtn = document.getElementById('confirm-action-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    messageEl.textContent = message;
    const confirmHandler = () => { onConfirm(); hideConfirmationModal(); };
    const cancelHandler = () => { hideConfirmationModal(); };
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    document.getElementById('confirm-action-btn').addEventListener('click', confirmHandler);
    document.getElementById('confirm-cancel-btn').addEventListener('click', cancelHandler);
    confirmationModal.classList.remove('hidden');
}

function hideConfirmationModal() {
    document.getElementById('confirmation-modal').classList.add('hidden');
}

// --- LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO ---
function showApp(isInitialLoad = false) {
    if (isInitialLoad) {
        loginScreen.classList.add('hidden');
        loadingScreen.classList.remove('hidden');
    }
    const userAvatarBtn = document.getElementById('user-avatar-btn');
    userAvatarBtn.innerHTML = '';
    const userInitial = currentUser.nome_usuario ? currentUser.nome_usuario.charAt(0).toUpperCase() : '?';
    const fallback = document.createElement('span');
    fallback.className = 'text-lg';
    fallback.textContent = userInitial;
    if (currentUser.foto_url) {
        const img = document.createElement('img');
        img.src = currentUser.foto_url;
        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        img.className = 'w-full h-full rounded-full object-cover';
        img.alt = 'Avatar';
        img.onerror = () => { userAvatarBtn.innerHTML = ''; userAvatarBtn.appendChild(fallback); };
        userAvatarBtn.appendChild(img);
    } else {
        userAvatarBtn.appendChild(fallback);
    }
    document.getElementById('popup-user-name').textContent = currentUser.nome_usuario;
    document.getElementById('popup-user-email').textContent = currentUser.email;
    initializeApp();
}

function showLogin() {
    localStorage.removeItem('crmUser');
    currentUser = null;
    crmApp.classList.add('hidden');
    loadingScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const telefone = document.getElementById('telefone').value;
    loginError.classList.add('hidden');
    try {
        const { data, error } = await dbClient.from('usuarios').select('*').eq('email', email).eq('telefone', telefone).single();
        if (error) throw new Error('Credenciais inválidas ou usuário não encontrado.');
        if (data) {
            currentUser = data;
            localStorage.setItem('crmUser', JSON.stringify(currentUser));
            showApp(true);
        } else {
            throw new Error('Credenciais inválidas.');
        }
    } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.remove('hidden');
    }
});

async function initializeApp() {
    try {
        // Usamos fetchAllRows para tabelas que podem passar de 1000 registros
        const [clientsRes, statusesRes, usersRes, tagsRes, clientTagsRes, tasksRes, ticketsRes] = await Promise.all([
            fetchAllRows('clientes'),
            dbClient.from('status').select('*'),
            dbClient.from('usuarios').select('*'),
            dbClient.from('tags').select('*'),
            fetchAllRows('cliente_tags'),
            fetchAllRows('tarefas'),
            fetchAllRows('tickets')
        ]);

        const results = [clientsRes, statusesRes, usersRes, tagsRes, clientTagsRes, tasksRes, ticketsRes];
        for (const res of results) {
            if (res.error) throw res.error;
        }

        appData = {
            clients: clientsRes.data, statuses: statusesRes.data, users: usersRes.data,
            tags: tagsRes.data, client_tags: clientTagsRes.data, tasks: tasksRes.data, tickets: ticketsRes.data
        };

        loadingScreen.classList.add('hidden');
        crmApp.classList.remove('hidden');

        setupFilterLogic();
        setupUserMenu();
        applyFiltersAndRender();
        setupRealtimeSubscriptions();
    } catch (error) {
        loadingScreen.classList.add('hidden');
        crmApp.classList.remove('hidden');
        kanbanBoard.innerHTML = `<div class="bg-red-100 text-red-700 p-4 rounded-lg"><b>Erro ao carregar dados:</b> ${error.message}</div>`;
        console.error("Erro na inicialização:", error);
    }
}

// --- LÓGICA DE TEMPO REAL (REALTIME) ---
function setupRealtimeSubscriptions() {
    console.log("Configurando inscrições de tempo real...");
    dbClient.channel('public-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, p => handleRealtimeChange(p, 'clients', 'id_cliente'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, p => handleRealtimeChange(p, 'tasks', 'id_tarefa'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, p => handleRealtimeChange(p, 'tickets', 'id_ticket'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cliente_tags' }, payload => {
            console.log('Alteração em cliente_tags:', payload);
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT') {
                // CORREÇÃO: Usa '==' para evitar problemas de tipo (string vs number) e previne duplicatas
                if (!appData.client_tags.some(ct => ct.id_cliente == newRecord.id_cliente && ct.id_tag == newRecord.id_tag)) {
                    appData.client_tags.push(newRecord);
                }
            }
            if (eventType === 'DELETE') {
                const oldIdCliente = oldRecord.id_cliente;
                const oldIdTag = oldRecord.id_tag;
                // CORREÇÃO: Usa '==' para garantir a remoção correta
                appData.client_tags = appData.client_tags.filter(ct => !(ct.id_cliente == oldIdCliente && ct.id_tag == oldIdTag));
            }
            applyFiltersAndRender();
        })
        .subscribe();
}

function handleRealtimeChange(payload, appDataKey, idKey) {
    console.log(`Alteração em ${appDataKey}:`, payload);
    const { eventType, new: newRecord, old: oldRecord } = payload;
    switch (eventType) {
        case 'INSERT':
            appData[appDataKey].push(newRecord);
            break;
        case 'UPDATE':
            const indexToUpdate = appData[appDataKey].findIndex(item => item[idKey] == newRecord[idKey]);
            if (indexToUpdate !== -1) appData[appDataKey][indexToUpdate] = newRecord;
            else appData[appDataKey].push(newRecord);
            break;
        case 'DELETE':
            const oldId = oldRecord[idKey] || (oldRecord.old_record ? oldRecord.old_record[idKey] : null);
            if (oldId) {
                appData[appDataKey] = appData[appDataKey].filter(item => item[idKey] != oldId);
            }
            break;
    }
    applyFiltersAndRender();
}

// --- LÓGICA DE FILTRAGEM E RENDERIZAÇÃO ---
function getFilteredClients() {
    let filteredClients = appData.clients;
    if (activeTagId) {
        const clientIdsWithTag = appData.client_tags.filter(ct => ct.id_tag == activeTagId).map(ct => ct.id_cliente);
        filteredClients = appData.clients.filter(client => clientIdsWithTag.includes(client.id_cliente));
    }
    const searchTerm = searchInput.value.trim().toLowerCase();
    if (searchTerm.length >= 2) {
        filteredClients = filteredClients.filter(client => client.nome_empresa.toLowerCase().includes(searchTerm));
    }
    return filteredClients;
}

function applyFiltersAndRender() {
    if (!clientModal.classList.contains('hidden')) {
        const form = modalContent.querySelector('#modal-form');
        if (form && form.dataset.clientId) {
            const client = appData.clients.find(c => c.id_cliente.toString() === form.dataset.clientId);
            if (client) {
                // Apenas atualiza as tags se o modal estiver aberto, para não recarregar tudo
                renderClientTags(client.id_cliente);
                renderTaskList(client.id_cliente);
                renderTicketList(client.id_cliente);
            } else {
                // Se o cliente não existe mais, fecha o modal
                hideClientModal();
            }
        }
    }

    if (currentView === 'kanban') {
        renderBoard(getFilteredClients());
    } else if (currentView === 'list') {
        renderListView();
    } else if (currentView === 'calendar') {
        renderCalendarView();
    }
}

function setupFilterLogic() {
    const triggerBtn = document.getElementById('filter-trigger-btn');
    const popup = document.getElementById('filter-popup');
    const optionsContainer = document.getElementById('filter-options-container');
    const btnText = document.getElementById('filter-btn-text');
    optionsContainer.innerHTML = '';
    if (appData.tags) {
        appData.tags.forEach(tag => {
            const option = document.createElement('a');
            option.href = '#';
            option.className = 'filter-tag-option text-gray-700 block px-4 py-2 text-sm';
            option.dataset.tagId = tag.id_tag;
            option.dataset.tagName = tag.nome_tag;
            option.dataset.tagColor = tag.cor;
            option.innerHTML = `<div class="flex items-center"><span class="w-3 h-3 rounded-full mr-3" style="background-color: ${tag.cor};"></span><span>${tag.nome_tag}</span></div>`;
            option.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget;
                activeTagId = target.dataset.tagId;
                btnText.textContent = target.dataset.tagName;
                triggerBtn.style.backgroundColor = `${target.dataset.tagColor}20`;
                triggerBtn.style.color = target.dataset.tagColor;
                triggerBtn.style.borderColor = target.dataset.tagColor;
                triggerBtn.dataset.activeTagId = activeTagId;
                popup.classList.add('hidden');
                applyFiltersAndRender();
            });
            optionsContainer.appendChild(option);
        });
    }
    triggerBtn.addEventListener('click', () => {
        if (triggerBtn.dataset.activeTagId) {
            activeTagId = null;
            triggerBtn.dataset.activeTagId = '';
            btnText.textContent = 'TODOS';
            triggerBtn.style.backgroundColor = 'white';
            triggerBtn.style.color = '#374151';
            triggerBtn.style.borderColor = '#D1D5DB';
            applyFiltersAndRender();
        } else {
            popup.classList.toggle('hidden');
        }
    });
    searchInput.addEventListener('input', applyFiltersAndRender);
}

function setupUserMenu() {
    const userMenuContainer = document.getElementById('user-menu-container');
    const userAvatarBtn = document.getElementById('user-avatar-btn');
    const logoutPopup = document.getElementById('logout-popup');
    const popupLogoutBtn = document.getElementById('popup-logout-btn');
    userAvatarBtn.addEventListener('click', () => logoutPopup.classList.toggle('hidden'));
    popupLogoutBtn.addEventListener('click', (e) => { e.preventDefault(); logoutPopup.classList.add('hidden'); showLogin(); });
    document.addEventListener('click', (e) => {
        if (!userMenuContainer.contains(e.target)) logoutPopup.classList.add('hidden');
        if (!document.getElementById('filter-container').contains(e.target)) document.getElementById('filter-popup').classList.add('hidden');
    });
}

// --- RENDERIZAÇÃO DO QUADRO KANBAN ---
function renderBoard(clientList = []) {
    kanbanBoard.innerHTML = '';
    appData.statuses.sort((a, b) => a.ordem - b.ordem).forEach(status => {
        const column = document.createElement('div');
        column.className = 'kanban-column bg-slate-100 rounded-lg p-3 w-[88vw] sm:w-80 flex-shrink-0 transition-all duration-300';
        const clientsInStatus = clientList.filter(c => c.status === status.nome_status);
        const initialClients = clientsInStatus.slice(0, CARDS_TO_SHOW_INITIAL);
        column.innerHTML = `
            <div class="column-header-expanded flex justify-between items-center mb-3 flex-shrink-0">
                <div class="flex items-center min-w-0"><h2 class="font-bold text-gray-700 truncate">${status.nome_status}</h2><span class="ml-2 bg-slate-200 text-slate-600 text-sm font-semibold rounded-full px-2">${clientsInStatus.length}</span></div>
                <button class="collapse-btn text-gray-400 hover:text-gray-600"><i class="fa-solid fa-angles-left"></i></button>
            </div>
            <div class="column-header-collapsed hidden flex-col items-center justify-between h-full flex-shrink-0">
                <div class="vertical-text font-bold text-gray-700">${status.nome_status}</div><span class="bg-slate-200 text-slate-600 text-sm font-semibold rounded-full w-6 h-6 flex items-center justify-center mb-2">${clientsInStatus.length}</span>
                <button class="collapse-btn text-gray-400 hover:text-gray-600"><i class="fa-solid fa-angles-left"></i></button>
            </div>
            <div class="kanban-cards min-h-[100px]" data-status-name="${status.nome_status}"></div>`;
        const cardsContainer = column.querySelector('.kanban-cards');
        initialClients.forEach(client => cardsContainer.appendChild(createClientCard(client)));
        kanbanBoard.appendChild(column);
        if (clientsInStatus.length > CARDS_TO_SHOW_INITIAL) {
            attachLazyLoad(cardsContainer, clientsInStatus);
        }
    });
    initializeDragAndDrop();
    initializeColumnControls();
}

function attachLazyLoad(container, allClients) {
    let renderedCount = container.children.length;
    container.addEventListener('scroll', () => {
        if (container.dataset.loading === 'true') return;
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
            if (renderedCount < allClients.length) {
                container.dataset.loading = 'true';
                const nextBatch = allClients.slice(renderedCount, renderedCount + CARDS_TO_LOAD_MORE);
                nextBatch.forEach(client => container.appendChild(createClientCard(client)));
                renderedCount += nextBatch.length;
                setTimeout(() => { container.dataset.loading = 'false'; }, 100);
            }
        }
    });
}

function initializeColumnControls() {
    document.querySelectorAll('.collapse-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); btn.closest('.kanban-column').classList.toggle('collapsed'); });
    });
    document.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('click', (e) => { if (column.classList.contains('collapsed')) { column.classList.remove('collapsed'); } })
    })
}

function formatTimeRemaining(dueDateString) {
    if (!dueDateString) return { text: 'Sem prazo', colorClass: 'text-gray-500', pulse: false };
    const dueDate = new Date(dueDateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(23, 59, 59, 999);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `Atrasado ${Math.abs(diffDays)}d`, colorClass: 'text-red-500 font-semibold', pulse: true };
    if (diffDays === 0) return { text: 'Hoje', colorClass: 'text-orange-500 font-semibold', pulse: true };
    if (diffDays === 1) return { text: 'Amanhã', colorClass: 'text-yellow-600 font-semibold', pulse: false };
    if (diffDays <= 7) return { text: `Faltam ${diffDays} dias`, colorClass: 'text-yellow-600', pulse: false };
    return { text: `Faltam ${diffDays} dias`, colorClass: 'text-gray-500', pulse: false };
}

function createClientCard(client) {
    const card = document.createElement('div');
    card.className = 'kanban-card bg-white rounded-lg p-4 mb-3 border border-gray-200 hover:border-green-400 hover:shadow-md cursor-pointer transition-all';
    card.dataset.clientId = client.id_cliente;
    const clientTags = (appData.client_tags || []).filter(ct => ct.id_cliente == client.id_cliente).map(ct => (appData.tags || []).find(t => t.id_tag == ct.id_tag)).filter(Boolean);
    const tagsHtml = clientTags.map(tag => `<span class="text-xs font-medium mr-1 mb-1 px-2 py-0.5 rounded-full" style="background-color:${tag.cor}20; color:${tag.cor};">${tag.nome_tag}</span>`).join('');
    const progress = calculateProgress(client.id_cliente);
    const clientTasks = appData.tasks ? appData.tasks.filter(t => t.id_cliente === client.id_cliente && !t.concluido && t.prazo_final) : [];
    clientTasks.sort((a, b) => new Date(a.prazo_final) - new Date(b.prazo_final));
    const nextTask = clientTasks[0];
    let nextTaskHtml;
    if (nextTask) {
        const timeInfo = formatTimeRemaining(nextTask.prazo_final);
        nextTaskHtml = `
            <div class="mt-3 pt-3 border-t border-gray-100 group relative cursor-pointer" data-task-id="${nextTask.id_tarefa}">
                <div class="absolute inset-0 bg-green-100 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hidden md:flex items-center justify-center">
                    <span class="text-green-700 font-bold"><i class="fas fa-check mr-2"></i>Marcar como concluída?</span>
                </div>
                <p class="text-xs text-gray-400 font-semibold uppercase">Próxima Tarefa</p>
                <div class="flex items-center justify-between mt-2">
                    <div class="break-words w-full pr-2">
                        <span class="text-sm text-gray-700 font-medium">${nextTask.titulo_tarefa}</span>
                        <p class="text-sm mt-1 ${timeInfo.colorClass} ${timeInfo.pulse ? 'pulse-animation' : ''}">${timeInfo.text}</p>
                    </div>
                    <div class="user-avatar-placeholder w-8 h-8 flex-shrink-0"></div>
                </div>
            </div>`;
    } else {
        nextTaskHtml = `<div class="text-sm text-gray-400 mt-3 pt-3 border-t border-gray-100">Nenhuma tarefa pendente com prazo.</div>`;
    }
    card.innerHTML = `
        <h3 class="font-semibold text-gray-800 truncate">${client.nome_empresa}</h3>
        <p class="text-sm text-gray-500 mb-3"><i class="fas fa-user mr-2 text-gray-400"></i>${client.nome_responsavel}</p>
        <div class="flex flex-wrap gap-y-1 mb-3">${tagsHtml}</div>
        <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-green-500 h-2 rounded-full" style="width: ${progress}%"></div></div>
        ${nextTaskHtml}`;
    const avatarPlaceholder = card.querySelector('.user-avatar-placeholder');
    if (avatarPlaceholder && nextTask) {
        const responsibleUser = appData.users.find(u => u.id_usuario == nextTask.responsavel_id);
        if (responsibleUser) {
            const userInitial = responsibleUser.nome_usuario ? responsibleUser.nome_usuario.charAt(0).toUpperCase() : '?';
            const fallbackAvatar = document.createElement('div');
            fallbackAvatar.className = 'w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold';
            fallbackAvatar.title = responsibleUser.nome_usuario;
            fallbackAvatar.textContent = userInitial;
            if (responsibleUser.foto_url) {
                const avatarImg = document.createElement('img');
                avatarImg.src = responsibleUser.foto_url;
                avatarImg.crossOrigin = "anonymous";
                avatarImg.referrerPolicy = "no-referrer";
                avatarImg.className = 'w-8 h-8 rounded-full flex-shrink-0 object-cover';
                avatarImg.title = responsibleUser.nome_usuario;
                avatarImg.onerror = () => { avatarPlaceholder.innerHTML = ''; avatarPlaceholder.appendChild(fallbackAvatar); };
                avatarPlaceholder.appendChild(avatarImg);
            } else {
                avatarPlaceholder.appendChild(fallbackAvatar);
            }
        } else {
            avatarPlaceholder.innerHTML = `<div class="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400 text-xs" title="Sem responsável"><i class="fas fa-user"></i></div>`;
        }
    }
    return card;
}

// --- LÓGICA DO DRAG-AND-DROP ---
function initializeDragAndDrop() {
    document.querySelectorAll('.kanban-cards').forEach(column => {
        new Sortable(column, {
            group: 'kanban', animation: 150, delay: 200, delayOnTouchOnly: true,
            onEnd: async (evt) => {
                const { item, to, from } = evt;
                const clientId = item.dataset.clientId;
                const newStatus = to.dataset.statusName;
                const client = appData.clients.find(c => c.id_cliente == clientId);
                if (client) {
                    client.status = newStatus;
                    updateColumnHeaders();
                }
                try {
                    const { error } = await dbClient.from('clientes').update({ status: newStatus }).eq('id_cliente', clientId);
                    if (error) throw error;
                } catch (error) {
                    showToast('Erro ao atualizar status.');
                    if (client) client.status = from.dataset.statusName;
                    from.appendChild(item);
                    updateColumnHeaders();
                    console.error("Erro ao mover card:", error);
                }
            }
        });
    });
}

// --- LÓGICA DE EVENTOS PRINCIPAIS (DELEGAÇÃO) ---
function initializeMainEventListeners() {
    kanbanBoard.addEventListener('click', (e) => {
        const card = e.target.closest('.kanban-card');
        const quickComplete = e.target.closest('.group[data-task-id]');
        if (quickComplete && window.innerWidth >= 768) {
            e.stopPropagation();
            handleToggleTask(quickComplete.dataset.taskId, true);
            showToast('Tarefa concluída!');
            return;
        }
        if (card && card.dataset.clientId) {
            e.stopPropagation();
            showClientModal(card.dataset.clientId);
        }
    });
}

// --- LÓGICA DO PWA E INICIALIZAÇÃO GERAL ---
document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('ServiceWorker registrado:', reg.scope))
                .catch(err => console.log('Falha no registro do ServiceWorker:', err));
        });
    }

    initializeMainEventListeners();
    setupListViewInteractions();
    setupViewToggle();
    setupCalendarViewInteractions();

    const savedUser = localStorage.getItem('crmUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showApp(true);
    } else {
        showLogin();
    }
    clientModal.addEventListener('click', (e) => { if (e.target === clientModal) hideClientModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('item-editor-modal').classList.contains('hidden')) closeItemEditorModal();
            else if (!clientModal.classList.contains('hidden')) hideClientModal();
        }
    });
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    const installButtonLogin = document.getElementById('install-pwa-login-button');
    const installButtonHeader = document.getElementById('install-pwa-header-button');
    const showInstallButtons = () => { if (installButtonLogin) installButtonLogin.classList.remove('hidden'); if (installButtonHeader) installButtonHeader.classList.remove('hidden'); };
    const installHandler = () => {
        if (installButtonLogin) installButtonLogin.classList.add('hidden'); if (installButtonHeader) installButtonHeader.classList.add('hidden');
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            console.log(choiceResult.outcome === 'accepted' ? 'Usuário instalou o PWA' : 'Usuário recusou a instalação do PWA');
            deferredPrompt = null;
        });
    };
    showInstallButtons();
    if (installButtonLogin) installButtonLogin.addEventListener('click', installHandler);
    if (installButtonHeader) installButtonHeader.addEventListener('click', installHandler);
});

// --- FUNÇÕES DE LÓGICA (MODAL, TAREFAS, TICKETS, ETC.) ---

function calculateProgress(clientId) {
    const tasks = appData.tasks ? appData.tasks.filter(p => p.id_cliente === clientId) : [];
    if (tasks.length === 0) return 0;
    const completedTasks = tasks.filter(p => p.concluido).length;
    return Math.round((completedTasks / tasks.length) * 100);
}

// --- LÓGICA DE TROCA DE VISUALIZAÇÃO ---
function setupViewToggle() {
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const viewName = e.currentTarget.id.replace('-view-btn', ''); // kanban, list, calendar
            switchView(viewName);
        });
    });
}

function switchView(viewName) {
    currentView = viewName;

    kanbanBoard.classList.add('hidden');
    listView.classList.add('hidden');
    calendarView.classList.add('hidden');

    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-gray-100', 'text-gray-700');
        btn.classList.add('bg-white', 'text-gray-500', 'hover:bg-gray-100');
    });

    const activeBtn = document.getElementById(`${viewName}-view-btn`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'bg-gray-100', 'text-gray-700');
        activeBtn.classList.remove('bg-white', 'text-gray-500', 'hover:bg-gray-100');
    }

    if (viewName === 'kanban') {
        kanbanBoard.classList.remove('hidden');
    } else if (viewName === 'list') {
        listView.classList.remove('hidden');
        populateListViewFilters();
    } else if (viewName === 'calendar') {
        calendarView.classList.remove('hidden');
    }

    applyFiltersAndRender();
}

// --- FUNÇÕES DE GERENCIAMENTO DE TAGS NO MODAL ---

async function handleAddTag(clientId, tagId) {
    if (!clientId || !tagId) return;

    const select = document.getElementById('add-tag-select');
    if (select) select.disabled = true;

    // Atualização otimista: Adiciona localmente primeiro para uma UI mais rápida
    const newAssociation = { id_cliente: parseInt(clientId), id_tag: parseInt(tagId) };
    appData.client_tags.push(newAssociation);
    renderClientTags(clientId);

    try {
        const { error } = await dbClient.from('cliente_tags').insert({ id_cliente: clientId, id_tag: tagId });

        // O erro 23505 (chave duplicada) pode acontecer em uma race condition.
        // Como a UI já foi atualizada otimisticamente, podemos ignorar este erro específico.
        if (error && error.code !== '23505') {
            throw error; // Lança outros erros para o bloco catch
        }

        showToast('Tag adicionada!');

    } catch (error) {
        console.error('Erro ao adicionar tag:', error);
        showToast('Erro ao adicionar tag.');

        // Reverte a atualização otimista em caso de erro
        appData.client_tags = appData.client_tags.filter(
            ct => !(ct.id_cliente.toString() === clientId.toString() && ct.id_tag.toString() === tagId.toString())
        );
        renderClientTags(clientId); // Re-renderiza para refletir a reversão
    } finally {
        if (select) {
            select.disabled = false;
            select.value = '';
        }
    }
}

async function handleRemoveTag(clientId, tagId) {
    showConfirmationModal('Tem certeza que deseja remover esta tag?', async () => {
        try {
            const { error } = await dbClient.from('cliente_tags').delete().match({ id_cliente: clientId, id_tag: tagId });
            if (error) throw error;

            // Atualização otimista com comparação de tipos robusta
            const clientIdStr = clientId.toString();
            const tagIdStr = tagId.toString();
            appData.client_tags = appData.client_tags.filter(
                ct => !(ct.id_cliente.toString() === clientIdStr && ct.id_tag.toString() === tagIdStr)
            );

            renderClientTags(clientId); // Re-renderiza as tags no modal
            showToast('Tag removida!');
        } catch (error) {
            console.error('Erro ao remover tag:', error);
            showToast('Erro ao remover tag.');
        }
    });
}

function renderClientTags(clientId) {
    const container = document.getElementById('modal-tags-container');
    if (!container) return;

    const clientTagIds = appData.client_tags
        .filter(ct => ct.id_cliente == clientId)
        .map(ct => ct.id_tag);

    const currentTags = appData.tags.filter(t => clientTagIds.includes(t.id_tag));
    const availableTags = appData.tags.filter(t => !clientTagIds.includes(t.id_tag));

    let tagsHtml = currentTags.map(tag => `
        <span class="flex items-center text-xs font-medium px-2 py-1 rounded-full" style="background-color:${tag.cor}20; color:${tag.cor};">
            ${tag.nome_tag}
            <button title="Remover Tag" class="remove-tag-btn ml-1.5 w-4 h-4 rounded-full hover:bg-black/20 flex items-center justify-center" data-tag-id="${tag.id_tag}" data-client-id="${clientId}">
                <i class="fas fa-times text-xs" style="color:${tag.cor};"></i>
            </button>
        </span>
    `).join('');

    let selectOptions = availableTags.length > 0
        ? availableTags.map(tag => `<option value="${tag.id_tag}">${tag.nome_tag}</option>`).join('')
        : '<option disabled>Nenhuma tag disponível</option>';

    const selectHtml = `
        <div class="relative">
            <select id="add-tag-select" class="form-input !m-0 !py-1 !pl-3 !pr-8 text-sm appearance-none bg-slate-50 hover:bg-slate-100 cursor-pointer">
                <option value="">Adicionar tag...</option>
                ${selectOptions}
            </select>
        </div>
    `;

    container.innerHTML = tagsHtml + selectHtml;

    container.querySelectorAll('.remove-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const { tagId, clientId } = e.currentTarget.dataset;
            handleRemoveTag(clientId, tagId);
        });
    });

    const addTagSelect = document.getElementById('add-tag-select');
    addTagSelect.addEventListener('change', (e) => {
        const tagId = e.target.value;
        if (tagId) {
            handleAddTag(clientId, tagId);
        }
    });
}

// --- FUNÇÕES DO MODAL DO CLIENTE ---

function showClientModal(clientId, onReadyCallback = null) {
    const client = appData.clients.find(c => c.id_cliente == clientId);
    if (!client) return;

    const uncompletedTasksCount = appData.tasks ? appData.tasks.filter(t => t.id_cliente == clientId && !t.concluido).length : 0;
    const uncompletedTicketsCount = appData.tickets ? appData.tickets.filter(t => t.id_cliente == clientId && !t.concluido).length : 0;
    const tasksBadgeHtml = uncompletedTasksCount > 0 ? `<span class="tab-badge">${uncompletedTasksCount}</span>` : '';
    const ticketsBadgeHtml = uncompletedTicketsCount > 0 ? `<span class="tab-badge">${uncompletedTicketsCount}</span>` : '';

    modalContent.innerHTML = '';
    modalContent.appendChild(loaderTemplate.content.cloneNode(true));
    clientModal.classList.remove('hidden');

    requestAnimationFrame(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
    });

    modalContent.innerHTML = `
        <div class="p-6 border-b flex-shrink-0">
            <div class="flex justify-between items-start gap-4">
                <h2 class="text-2xl sm:text-3xl font-bold text-gray-800 flex-shrink-0 mr-4">${client.nome_empresa}</h2>
                <div id="modal-tags-container" class="flex-grow flex items-center flex-wrap gap-2 justify-end">
                    </div>
                <button id="close-modal-btn" class="text-gray-400 hover:text-gray-600 text-2xl flex-shrink-0">&times;</button>
            </div>
        </div>
        <div class="border-b border-gray-200 flex-shrink-0">
            <nav id="modal-tabs" class="flex space-x-2 sm:space-x-4 px-4 sm:px-6 -mb-px overflow-x-auto">
                <button data-tab="details" class="tab-button active flex-shrink-0">Detalhes</button>
                <button data-tab="tasks" class="tab-button flex-shrink-0 flex items-center">Tarefas ${tasksBadgeHtml}</button>
                <button data-tab="tickets" class="tab-button flex-shrink-0 flex items-center">Tickets ${ticketsBadgeHtml}</button>
            </nav>
        </div>
        <div class="p-4 sm:p-6 overflow-y-auto flex-grow">
            <div id="tab-content-details" class="tab-content active">
                <div id="modal-form" data-client-id="${clientId}">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div><label class="text-sm font-medium text-gray-700">Nome da Empresa</label><input type="text" id="modal-nome_empresa" value="${client.nome_empresa || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">CNPJ</label><input type="text" id="modal-cnpj" value="${client.cnpj || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">Nome do Responsável</label><input type="text" id="modal-nome_responsavel" value="${client.nome_responsavel || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">WhatsApp</label><input type="text" id="modal-whatsapp" value="${client.whatsapp || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">E-mail Financeiro</label><input type="text" id="modal-email_financeiro" value="${client.email_financeiro || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">Telefone do Dono</label><input type="text" id="modal-telefone_dono" value="${client.telefone_dono || ''}" class="form-input"></div>
                        <div class="md:col-span-2"><label class="text-sm font-medium text-gray-700">Link do Grupo WhatsApp</label><input type="text" id="modal-link_grupo_whatsapp" value="${client.link_grupo_whatsapp || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">Valor do Contrato</label><input type="text" id="modal-valor_contrato" value="${client.valor_contrato || ''}" class="form-input" placeholder="R$ 0,00"></div>
                        <div class="md:col-span-2"><label class="text-sm font-medium text-gray-700">Anotações</label><textarea id="modal-anotacoes" rows="4" class="form-input">${client.anotacoes || ''}</textarea></div>
                    </div>
                    <div class="mt-8 pt-5 border-t flex justify-end items-center gap-3">
                        <span id="save-status" class="text-sm text-green-600"></span>
                        <button id="save-client-btn" class="bg-[#2fc36a] hover:bg-[#29a85b] text-white font-bold py-2 px-4 rounded-full flex items-center"><i class="fas fa-save mr-2"></i>Salvar Alterações</button>
                    </div>
                </div>
            </div>
            <div id="tab-content-tasks" class="tab-content">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-gray-600">Tarefas do Projeto</h4>
                    <button id="add-main-task-btn" class="bg-[#2fc36a] hover:bg-[#29a85b] text-white text-sm font-bold py-1 px-3 rounded-full flex items-center"><i class="fas fa-plus mr-2"></i>Nova Tarefa</button>
                </div>
                <div id="task-list-container" class="bg-slate-50 p-2 sm:p-4 rounded-lg"></div>
                <div id="task-editor-container" class="mt-4 border-t pt-4 hidden"></div>
            </div>
            <div id="tab-content-tickets" class="tab-content">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-gray-600">Tickets/Chamados</h4>
                    <button id="add-main-ticket-btn" class="bg-[#2fc36a] hover:bg-[#29a85b] text-white text-sm font-bold py-1 px-3 rounded-full flex items-center"><i class="fas fa-plus mr-2"></i>Novo Ticket</button>
                </div>
                <div id="ticket-list-container" class="bg-slate-50 p-2 sm:p-4 rounded-lg"></div>
                <div id="ticket-editor-container" class="mt-4 border-t pt-4 hidden"></div>
            </div>
        </div>`;

    // Renderiza as tags e adiciona os event listeners
    renderClientTags(clientId);

    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-content-${tab.dataset.tab}`).classList.add('active');
        });
    });

    renderTaskList(clientId);
    renderTicketList(clientId);

    document.getElementById('close-modal-btn').addEventListener('click', hideClientModal);
    document.getElementById('save-client-btn').addEventListener('click', () => handleSaveClient(clientId));
    document.getElementById('add-main-task-btn').addEventListener('click', () => showNewTaskForm(clientId, null));
    document.getElementById('add-main-ticket-btn').addEventListener('click', () => showNewTicketForm(clientId, null));

    if (onReadyCallback) {
        requestAnimationFrame(onReadyCallback);
    }
}

function hideClientModal() {
    const form = modalContent.querySelector('#modal-form');
    if (form) {
        const clientId = form.dataset.clientId;
        const client = appData.clients.find(c => c.id_cliente.toString() === clientId);
        if (client) {
            updateCardOnBoard(client.id_cliente);
        }
    }
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        clientModal.classList.add('hidden');
        if (currentView === 'list') {
            renderListView();
        }
    }, 300);
}

function updateCardOnBoard(clientId) {
    const cardElement = document.querySelector(`.kanban-card[data-client-id="${clientId}"]`);
    if (cardElement) {
        const client = appData.clients.find(c => c.id_cliente === clientId);
        if (client) {
            const newCard = createClientCard(client);
            cardElement.replaceWith(newCard);
        }
    }
}
function updateColumnHeaders() {
    const clientList = getFilteredClients();
    appData.statuses.forEach(status => {
        const column = kanbanBoard.querySelector(`[data-status-name="${status.nome_status}"]`)?.closest('.kanban-column');
        if (column) {
            const clientsInStatus = clientList.filter(c => c.status === status.nome_status);
            const count = clientsInStatus.length;
            const expandedCountEl = column.querySelector('.column-header-expanded .ml-2');
            if (expandedCountEl) expandedCountEl.textContent = count;
            const collapsedCountEl = column.querySelector('.column-header-collapsed .rounded-full');
            if (collapsedCountEl) collapsedCountEl.textContent = count;
        }
    });
}

async function handleSaveClient(clientId) {
    const saveBtn = document.getElementById('save-client-btn');
    const saveStatus = document.getElementById('save-status');
    saveBtn.disabled = true;
    saveStatus.textContent = 'Salvando...';

    const fields = ['nome_empresa', 'cnpj', 'nome_responsavel', 'whatsapp', 'email_financeiro', 'telefone_dono', 'link_grupo_whatsapp', 'valor_contrato', 'anotacoes'];
    const updatedData = {};
    fields.forEach(field => {
        const element = document.getElementById(`modal-${field}`);
        if (element) {
            updatedData[field] = element.value;
        }
    });

    try {
        const { error } = await dbClient.from('clientes').update(updatedData).eq('id_cliente', clientId);
        if (error) throw error;
        saveStatus.textContent = 'Salvo com sucesso!';
        setTimeout(() => hideClientModal(), 1000);
    } catch (error) {
        saveStatus.textContent = 'Erro ao salvar!';
        console.error("Erro ao salvar cliente:", error);
        showToast("Erro ao salvar alterações.");
    } finally {
        saveBtn.disabled = false;
        setTimeout(() => saveStatus.textContent = '', 2000);
    }
}

// --- FUNÇÕES DE TAREFAS ---
function renderTaskList(clientId) {
    const container = document.getElementById('task-list-container');
    const clientTasks = appData.tasks ? appData.tasks.filter(t => t.id_cliente == clientId) : [];

    function buildTaskTree(parentId) {
        const tasks = clientTasks.filter(task => {
            if (parentId === null) return task.parent_id_tarefa === null;
            return task.parent_id_tarefa == parentId;
        });
        if (tasks.length === 0) return '';
        let html = `<div class="${parentId !== null ? 'ml-6 border-l-2 border-gray-200 pl-4' : ''}">`;
        tasks.sort((a, b) => a.ordem - b.ordem).forEach(task => {
            const responsibleUser = appData.users.find(u => u.id_usuario == task.responsavel_id);
            const dueDate = task.prazo_final ? new Date(task.prazo_final) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isOverdue = dueDate && dueDate < today;
            html += `
                <div class="task-item group flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                    <div class="flex items-center flex-grow min-w-0">
                        <input type="checkbox" data-task-id="${task.id_tarefa}" class="task-checkbox h-4 w-4 mr-3 flex-shrink-0" ${task.concluido ? 'checked' : ''}>
                        <div class="truncate">
                            <span class="task-title ${task.concluido ? 'line-through text-gray-400' : ''}">${task.titulo_tarefa}</span>
                            ${dueDate ? `<span class="ml-2 text-xs ${isOverdue ? 'text-red-500' : 'text-gray-500'}"><i class="far fa-calendar-alt mr-1"></i>${dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>` : ''}
                        </div>
                        ${responsibleUser ? `<span class="ml-2 text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">${responsibleUser.nome_usuario}</span>` : ''}
                    </div>
                    <div class="task-controls opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button title="Adicionar Subtarefa" class="add-subtask-btn text-gray-400 hover:text-green-500 p-1" data-parent-id="${task.id_tarefa}"><i class="fas fa-plus-circle"></i></button>
                        <button title="Editar Tarefa" class="edit-task-btn text-gray-400 hover:text-blue-500 p-1" data-task-id="${task.id_tarefa}"><i class="fas fa-pencil-alt"></i></button>
                        <button title="Apagar Tarefa" class="delete-task-btn text-gray-400 hover:text-red-500 p-1" data-task-id="${task.id_tarefa}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            html += buildTaskTree(task.id_tarefa);
        });
        html += `</div>`;
        return html;
    }
    container.innerHTML = buildTaskTree(null) || '<p class="text-gray-500">Nenhuma tarefa criada para este cliente.</p>';

    container.querySelectorAll('.task-checkbox').forEach(cb => cb.addEventListener('change', (e) => handleToggleTask(e.target.dataset.taskId, e.target.checked)));
    container.querySelectorAll('.add-subtask-btn').forEach(btn => btn.addEventListener('click', (e) => showNewTaskForm(clientId, e.currentTarget.dataset.parentId)));
    container.querySelectorAll('.edit-task-btn').forEach(btn => btn.addEventListener('click', (e) => showTaskEditor(e.currentTarget.dataset.taskId)));
    container.querySelectorAll('.delete-task-btn').forEach(btn => btn.addEventListener('click', (e) => handleDeleteTask(e.currentTarget.dataset.taskId)));
}

// --- FUNÇÕES DE TICKETS ---
function renderTicketList(clientId) {
    const container = document.getElementById('ticket-list-container');
    const allClientTickets = appData.tickets ? appData.tickets.filter(t => t.id_cliente == clientId) : [];

    const generateTicketItemHtml = (ticket) => {
        const responsibleUser = appData.users.find(u => u.id_usuario == ticket.responsavel_id);
        const dueDate = ticket.prazo_final ? new Date(ticket.prazo_final) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isOverdue = dueDate && dueDate < today && !ticket.concluido;
        return `
            <div class="task-item group flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                <div class="flex items-center flex-grow min-w-0">
                    <input type="checkbox" data-ticket-id="${ticket.id_ticket}" class="ticket-checkbox h-4 w-4 mr-3 flex-shrink-0" ${ticket.concluido ? 'checked' : ''}>
                    <div class="truncate">
                        <span class="ticket-title ${ticket.concluido ? 'line-through text-gray-400' : ''}">${ticket.titulo_ticket}</span>
                        ${dueDate ? `<span class="ml-2 text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500'}"><i class="far fa-calendar-alt mr-1"></i>${dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>` : ''}
                    </div>
                    ${responsibleUser ? `<span class="ml-2 text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">${responsibleUser.nome_usuario}</span>` : ''}
                </div>
                <div class="task-controls opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button title="Adicionar Sub-ticket" class="add-subticket-btn text-gray-400 hover:text-green-500 p-1" data-parent-id="${ticket.id_ticket}"><i class="fas fa-plus-circle"></i></button>
                    <button title="Editar Ticket" class="edit-ticket-btn text-gray-400 hover:text-blue-500 p-1" data-ticket-id="${ticket.id_ticket}"><i class="fas fa-pencil-alt"></i></button>
                    <button title="Apagar Ticket" class="delete-ticket-btn text-gray-400 hover:text-red-500 p-1" data-ticket-id="${ticket.id_ticket}"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
    };

    function buildTicketHtmlRecursive(parentId) {
        let ticketsForLevel = allClientTickets.filter(ticket => {
            if (parentId === null) return ticket.parent_id_ticket === null;
            return ticket.parent_id_ticket == parentId;
        });
        if (ticketsForLevel.length === 0) return '';
        let separatorHtml = '';
        if (parentId === null) {
            const uncompleted = ticketsForLevel.filter(t => !t.concluido);
            const completed = ticketsForLevel.filter(t => t.concluido);
            uncompleted.sort((a, b) => {
                const dateA = a.prazo_final ? new Date(a.prazo_final) : null;
                const dateB = b.prazo_final ? new Date(b.prazo_final) : null;
                if (dateA && dateB) return dateA - dateB;
                if (dateA) return -1;
                if (dateB) return 1;
                return 0;
            });
            ticketsForLevel = [...uncompleted, ...completed];
            if (uncompleted.length > 0 && completed.length > 0) {
                separatorHtml = `<div class="mt-4 pt-4 border-t border-gray-300"><h5 class="px-2 mb-2 text-sm font-semibold text-gray-500 uppercase">Concluídos</h5></div>`;
            }
        } else {
            ticketsForLevel.sort((a, b) => a.ordem - b.ordem);
        }
        let html = `<div class="${parentId !== null ? 'ml-6 border-l-2 border-gray-200 pl-4' : ''}">`;
        let uncompletedProcessed = false;
        ticketsForLevel.forEach((ticket) => {
            if (parentId === null && separatorHtml && ticket.concluido && !uncompletedProcessed) {
                html += separatorHtml;
                uncompletedProcessed = true;
            }
            html += generateTicketItemHtml(ticket);
            html += buildTicketHtmlRecursive(ticket.id_ticket);
        });
        html += `</div>`;
        return html;
    }
    container.innerHTML = buildTicketHtmlRecursive(null) || '<p class="text-gray-500">Nenhum ticket criado para este cliente.</p>';

    container.querySelectorAll('.ticket-checkbox').forEach(cb => cb.addEventListener('change', (e) => handleToggleTicket(e.target.dataset.ticketId, e.target.checked)));
    container.querySelectorAll('.add-subticket-btn').forEach(btn => btn.addEventListener('click', (e) => showNewTicketForm(clientId, e.currentTarget.dataset.parentId)));
    container.querySelectorAll('.edit-ticket-btn').forEach(btn => btn.addEventListener('click', (e) => showTicketEditor(e.currentTarget.dataset.ticketId)));
    container.querySelectorAll('.delete-ticket-btn').forEach(btn => btn.addEventListener('click', (e) => handleDeleteTicket(e.currentTarget.dataset.ticketId)));
}

// --- IMPLEMENTAÇÃO DAS FUNÇÕES DE TAREFAS (COM CORREÇÃO) ---

function showNewTaskForm(clientId, parentId = null) {
    const container = document.getElementById('task-editor-container');
    container.innerHTML = '';
    container.classList.remove('hidden');

    const formHtml = `
        <div class="task-form-container" id="new-task-form">
            <div class="mb-4">
                <input 
                    type="text" 
                    id="new-task-title" 
                    class="task-title-input" 
                    placeholder="Digite o título da tarefa e pressione Enter..."
                    autocomplete="off"
                >
            </div>
            <div id="task-form-details" class="hidden">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
                        <select id="new-task-responsible" class="form-input !mt-0">
                            <option value="">Selecionar responsável</option>
                            ${appData.users.map(user => `<option value="${user.id_usuario}">${user.nome_usuario}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Prazo Final</label>
                        <input type="date" id="new-task-deadline" class="form-input !mt-0">
                        <div class="flex gap-2 mt-2">
                            <button type="button" class="date-shortcut-btn suggestion-btn" data-days="3">3 dias</button>
                            <button type="button" class="date-shortcut-btn suggestion-btn" data-days="7">7 dias</button>
                            <button type="button" class="date-shortcut-btn suggestion-btn" data-days="15">15 dias</button>
                        </div>
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                    <textarea id="new-task-description" rows="3" class="form-input !mt-0" placeholder="Descrição detalhada da tarefa..."></textarea>
                </div>
                <div class="flex justify-end gap-3">
                    <button id="cancel-task-btn" class="px-4 py-2 text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-full font-semibold">Cancelar</button>
                    <button id="save-task-btn" class="px-4 py-2 text-white bg-[#2fc36a] hover:bg-[#29a85b] rounded-full font-semibold flex items-center">
                        <i class="fas fa-save mr-2"></i>Salvar Tarefa
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = formHtml;

    const titleInput = document.getElementById('new-task-title');
    const formDetails = document.getElementById('task-form-details');
    const formContainer = document.getElementById('new-task-form');
    const cancelBtn = document.getElementById('cancel-task-btn');
    const saveBtn = document.getElementById('save-task-btn');

    titleInput.focus();

    titleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && titleInput.value.trim()) {
            e.preventDefault();
            formDetails.classList.remove('hidden');
            formContainer.classList.add('task-form-expanded');
            document.getElementById('new-task-responsible').focus();
        }
    });

    cancelBtn.addEventListener('click', () => {
        container.classList.add('hidden');
        container.innerHTML = '';
    });

    saveBtn.addEventListener('click', () => {
        handleCreateTask(clientId, parentId);
    });

    container.querySelectorAll('.date-shortcut-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = parseInt(e.target.dataset.days);
            const today = new Date();
            const futureDate = new Date(today.getTime() + (days * 24 * 60 * 60 * 1000));
            const formattedDate = futureDate.toISOString().split('T')[0];
            document.getElementById('new-task-deadline').value = formattedDate;
        });
    });
}

async function handleCreateTask(clientId, parentId = null) {
    const title = document.getElementById('new-task-title').value.trim();
    const responsibleId = document.getElementById('new-task-responsible').value || null;
    const deadline = document.getElementById('new-task-deadline').value || null;
    const description = document.getElementById('new-task-description').value.trim() || null;

    if (!title) {
        showToast('O título da tarefa é obrigatório');
        return;
    }

    const saveBtn = document.getElementById('save-task-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Salvando...';

    try {
        const existingTasks = appData.tasks.filter(t =>
            t.id_cliente == clientId &&
            (parentId ? t.parent_id_tarefa == parentId : t.parent_id_tarefa === null)
        );
        const nextOrder = existingTasks.length > 0 ? Math.max(...existingTasks.map(t => t.ordem || 0)) + 1 : 1;

        const uniqueId = `TSK-${Date.now()}`;

        const taskData = {
            id_tarefa: uniqueId,
            id_cliente: parseInt(clientId),
            titulo_tarefa: title,
            descricao_detalhada: description,
            responsavel_id: responsibleId ? responsibleId.toString() : null,
            prazo_final: deadline,
            parent_id_tarefa: parentId ? parentId.toString() : null,
            ordem: nextOrder,
            concluido: false
        };

        const { data, error } = await dbClient.from('tarefas').insert([taskData]).select().single();

        if (error) throw error;

        showToast('Tarefa criada com sucesso!');

    } catch (error) {
        console.error('Erro ao criar tarefa:', error);
        showToast(`Erro ao criar tarefa: ${error.message}`);
    } finally {
        document.getElementById('task-editor-container').classList.add('hidden');
        document.getElementById('task-editor-container').innerHTML = '';
    }
}

async function handleToggleTask(taskId, completed) {
    try {
        const { error } = await dbClient
            .from('tarefas')
            .update({ concluido: completed })
            .eq('id_tarefa', taskId);

        if (error) throw error;

    } catch (error) {
        console.error('Erro ao atualizar tarefa:', error);
        showToast('Erro ao atualizar tarefa');
    }
}

async function handleDeleteTask(taskId) {
    const task = appData.tasks.find(t => t.id_tarefa == taskId);
    if (!task) return;
    const clientId = task.id_cliente;

    showConfirmationModal('Tem certeza que deseja excluir esta tarefa e todas as suas subtarefas?', async () => {
        try {
            const { error } = await dbClient.from('tarefas').delete().eq('id_tarefa', taskId);
            if (error) throw error;

            appData.tasks = appData.tasks.filter(t => t.id_tarefa != taskId);
            renderTaskList(clientId);
            updateCardOnBoard(clientId);

            showToast('Tarefa excluída com sucesso');
        } catch (error) {
            console.error('Erro ao excluir tarefa:', error);
            showToast('Erro ao excluir tarefa');
        }
    });
}

// --- IMPLEMENTAÇÃO DAS FUNÇÕES DE TICKETS (COM CORREÇÃO) ---

function showNewTicketForm(clientId, parentId = null) {
    const container = document.getElementById('ticket-editor-container');
    container.innerHTML = '';
    container.classList.remove('hidden');

    const formHtml = `
        <div class="task-form-container" id="new-ticket-form">
            <div class="mb-4">
                <input 
                    type="text" 
                    id="new-ticket-title" 
                    class="task-title-input" 
                    placeholder="Digite o título do ticket e pressione Enter..."
                    autocomplete="off"
                >
            </div>
            <div id="ticket-form-details" class="hidden">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
                        <select id="new-ticket-responsible" class="form-input !mt-0">
                            <option value="">Selecionar responsável</option>
                            ${appData.users.map(user => `<option value="${user.id_usuario}">${user.nome_usuario}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Prazo Final</label>
                        <input type="date" id="new-ticket-deadline" class="form-input !mt-0">
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                    <textarea id="new-ticket-description" rows="3" class="form-input !mt-0" placeholder="Descrição detalhada do ticket..."></textarea>
                </div>
                <div class="flex justify-end gap-3">
                    <button id="cancel-ticket-btn" class="px-4 py-2 text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-full font-semibold">Cancelar</button>
                    <button id="save-ticket-btn" class="px-4 py-2 text-white bg-[#2fc36a] hover:bg-[#29a85b] rounded-full font-semibold flex items-center">
                        <i class="fas fa-save mr-2"></i>Salvar Ticket
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = formHtml;

    const titleInput = document.getElementById('new-ticket-title');
    const formDetails = document.getElementById('ticket-form-details');
    const formContainer = document.getElementById('new-ticket-form');
    const cancelBtn = document.getElementById('cancel-ticket-btn');
    const saveBtn = document.getElementById('save-ticket-btn');

    titleInput.focus();

    titleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && titleInput.value.trim()) {
            e.preventDefault();
            formDetails.classList.remove('hidden');
            formContainer.classList.add('task-form-expanded');
            document.getElementById('new-ticket-responsible').focus();
        }
    });

    cancelBtn.addEventListener('click', () => {
        container.classList.add('hidden');
        container.innerHTML = '';
    });

    saveBtn.addEventListener('click', () => {
        handleCreateTicket(clientId, parentId);
    });
}

async function handleCreateTicket(clientId, parentId = null) {
    const title = document.getElementById('new-ticket-title').value.trim();
    const responsibleId = document.getElementById('new-ticket-responsible').value || null;
    const deadline = document.getElementById('new-ticket-deadline').value || null;
    const description = document.getElementById('new-ticket-description').value.trim() || null;

    if (!title) {
        showToast('O título do ticket é obrigatório');
        return;
    }

    const saveBtn = document.getElementById('save-ticket-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Salvando...';

    try {
        const existingTickets = appData.tickets.filter(t =>
            t.id_cliente == clientId &&
            (parentId ? t.parent_id_ticket == parentId : t.parent_id_ticket === null)
        );
        const nextOrder = existingTickets.length > 0 ? Math.max(...existingTickets.map(t => t.ordem || 0)) + 1 : 1;

        const uniqueId = `TCK-${Date.now()}`;

        const ticketData = {
            id_ticket: uniqueId,
            id_cliente: parseInt(clientId),
            titulo_ticket: title,
            descricao_detalhada: description,
            responsavel_id: responsibleId ? responsibleId.toString() : null,
            prazo_final: deadline,
            parent_id_ticket: parentId ? parentId.toString() : null,
            ordem: nextOrder,
            concluido: false
        };

        const { data, error } = await dbClient.from('tickets').insert([ticketData]).select().single();

        if (error) throw error;

        showToast('Ticket criado com sucesso!');

    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        showToast(`Erro ao criar ticket: ${error.message}`);
    } finally {
        document.getElementById('ticket-editor-container').classList.add('hidden');
        document.getElementById('ticket-editor-container').innerHTML = '';
    }
}

async function handleToggleTicket(ticketId, completed) {
    try {
        const { error } = await dbClient
            .from('tickets')
            .update({ concluido: completed })
            .eq('id_ticket', ticketId);

        if (error) throw error;

    } catch (error) {
        console.error('Erro ao atualizar ticket:', error);
        showToast('Erro ao atualizar ticket');
    }
}

async function handleDeleteTicket(ticketId) {
    showConfirmationModal('Tem certeza que deseja excluir este ticket e todos os seus sub-tickets?', async () => {
        try {
            const { error } = await dbClient.from('tickets').delete().eq('id_ticket', ticketId);
            if (error) throw error;
            showToast('Ticket excluído com sucesso');
        } catch (error) {
            console.error('Erro ao excluir ticket:', error);
            showToast('Erro ao excluir ticket');
        }
    });
}

// --- FUNÇÕES DA NOVA VISÃO DE LISTA ---

function populateListViewFilters() {
    const responsibleFilter = document.getElementById('list-filter-responsible');
    const typeFilter = document.getElementById('list-filter-type');
    if (responsibleFilter.options.length > 1) return;

    responsibleFilter.innerHTML = `<option value="all">Todos os Responsáveis</option>`;
    (appData.users || []).forEach(user => {
        responsibleFilter.innerHTML += `<option value="${user.id_usuario}">${user.nome_usuario}</option>`;
    });

    const filterHandler = () => {
        listFilterType = typeFilter.value;
        listFilterResponsibleId = responsibleFilter.value;
        renderListView();
    };

    responsibleFilter.addEventListener('change', filterHandler);
    typeFilter.addEventListener('change', filterHandler);
}

function createListItemHtml(item) {
    const client = appData.clients.find(c => c.id_cliente == item.clientId);
    const responsibleUser = appData.users.find(u => u.id_usuario == item.responsibleId);
    const timeInfo = formatTimeRemaining(item.dueDate);

    let avatarHtml = `<div title="Sem responsável" class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400"><i class="fas fa-user"></i></div>`;
    if (responsibleUser) {
        if (responsibleUser.foto_url) {
            avatarHtml = `<img src="${responsibleUser.foto_url}" alt="${responsibleUser.nome_usuario}" title="${responsibleUser.nome_usuario}" class="w-8 h-8 rounded-full object-cover">`;
        } else {
            const initial = responsibleUser.nome_usuario ? responsibleUser.nome_usuario.charAt(0).toUpperCase() : '?';
            avatarHtml = `<div title="${responsibleUser.nome_usuario}" class="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold">${initial}</div>`;
        }
    }

    const iconHtml = item.type === 'task'
        ? `<div class="w-8 text-center" title="Tarefa"><i class="fas fa-clipboard-check text-slate-400"></i></div>`
        : `<div class="w-8 text-center" title="Ticket"><i class="fas fa-ticket text-orange-400"></i></div>`;

    return `
        <div class="list-item-row flex items-center p-3 sm:p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-green-400 cursor-pointer" data-item-id="${item.id}" data-item-type="${item.type}" data-client-id="${item.clientId}">
            <div class="flex-shrink-0 pr-3">
                <input type="checkbox" class="list-item-checkbox h-5 w-5 rounded border-gray-400 text-green-600 focus:ring-green-500 cursor-pointer" data-item-id="${item.id}" data-item-type="${item.type}" ${item.completed ? 'checked' : ''}>
            </div>
            <div class="flex-grow min-w-0">
                <p class="font-semibold text-gray-800 truncate ${item.completed ? 'line-through text-gray-500 font-normal' : ''}" title="${item.title}">${item.title}</p>
                <p class="text-sm text-gray-500 truncate">${client ? client.nome_empresa : 'Cliente não encontrado'}</p>
            </div>
            <div class="flex-shrink-0 flex items-center space-x-2 sm:space-x-4 pl-3 ml-auto">
                ${iconHtml}
                <span class="text-sm w-28 text-right hidden sm:block ${timeInfo.colorClass} ${timeInfo.pulse ? 'pulse-animation' : ''}">${timeInfo.text}</span>
                <div class="w-8 h-8 flex-shrink-0">
                    ${avatarHtml}
                </div>
            </div>
        </div>
    `;
}

function renderListView() {
    const container = document.getElementById('list-view-container');
    container.innerHTML = loaderTemplate.content.cloneNode(true).firstElementChild.outerHTML;

    let allItems = [
        ...(appData.tasks || []).map(task => ({ type: 'task', id: task.id_tarefa, title: task.titulo_tarefa, dueDate: task.prazo_final, responsibleId: task.responsavel_id, clientId: task.id_cliente, completed: task.concluido })),
        ...(appData.tickets || []).map(ticket => ({ type: 'ticket', id: ticket.id_ticket, title: ticket.titulo_ticket, dueDate: ticket.prazo_final, responsibleId: ticket.responsavel_id, clientId: ticket.id_cliente, completed: ticket.concluido }))
    ];

    const searchTerm = searchInput.value.trim().toLowerCase();
    let filteredItems = allItems.filter(item => {
        if (listFilterType !== 'all' && item.type !== listFilterType) return false;
        if (listFilterResponsibleId !== 'all' && item.responsibleId != listFilterResponsibleId) return false;
        const client = appData.clients.find(c => c.id_cliente == item.clientId);
        if (!client) return false;
        if (searchTerm.length >= 2 && !client.nome_empresa.toLowerCase().includes(searchTerm)) return false;
        if (activeTagId) {
            const clientHasTag = appData.client_tags.some(ct => ct.id_cliente == item.clientId && ct.id_tag == activeTagId);
            if (!clientHasTag) return false;
        }
        return true;
    });

    filteredItems.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const dateA = a.dueDate ? new Date(a.dueDate) : null;
        const dateB = b.dueDate ? new Date(b.dueDate) : null;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
    });

    currentRenderedListItems = filteredItems;
    isFetchingMore = false;

    const initialItems = currentRenderedListItems.slice(0, LIST_ITEMS_INITIAL);

    if (initialItems.length === 0) {
        container.innerHTML = `<div class="text-center p-8 text-gray-500">Nenhuma atividade encontrada com os filtros atuais.</div>`;
        return;
    }

    container.className = "flex-grow space-y-3";
    container.innerHTML = initialItems.map(createListItemHtml).join('');
}

function appendMoreListItems() {
    if (isFetchingMore) return;
    const container = document.getElementById('list-view-container');
    const renderedCount = container.children.length;

    if (renderedCount >= currentRenderedListItems.length) return;

    isFetchingMore = true;

    const nextBatch = currentRenderedListItems.slice(renderedCount, renderedCount + LIST_ITEMS_MORE);
    const newHtml = nextBatch.map(createListItemHtml).join('');

    container.insertAdjacentHTML('beforeend', newHtml);

    setTimeout(() => { isFetchingMore = false; }, 100);
}

function setupListViewInteractions() {
    const wrapper = document.getElementById('list-view-container-wrapper');

    wrapper.addEventListener('scroll', () => {
        if (currentView !== 'list') return;
        const { scrollTop, scrollHeight, clientHeight } = wrapper;
        if (scrollTop + clientHeight >= scrollHeight - 300) {
            appendMoreListItems();
        }
    });

    wrapper.addEventListener('click', e => {
        const row = e.target.closest('.list-item-row');
        if (!row) return;

        const itemId = row.dataset.itemId;
        const itemType = row.dataset.itemType;
        const clientId = row.dataset.clientId;

        if (e.target.matches('.list-item-checkbox')) {
            const isChecked = e.target.checked;
            if (itemType === 'task') {
                handleToggleTask(itemId, isChecked);
            } else if (itemType === 'ticket') {
                handleToggleTicket(itemId, isChecked);
            }
            return;
        }

        showClientModal(clientId, () => {
            const tabToClick = itemType === 'task' ? 'tasks' : 'tickets';
            const editorToShow = itemType === 'task' ? showTaskEditor : showTicketEditor;
            document.querySelector(`button[data-tab="${tabToClick}"]`).click();
            editorToShow(itemId);
        });
    });
}

// ==========================================================
// INÍCIO: FUNÇÕES DA NOVA VISÃO DE CALENDÁRIO
// ==========================================================

function setupCalendarViewInteractions() {
    const tabsContainer = document.getElementById('calendar-tabs');
    tabsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.calendar-tab-button');
        if (!button) return;

        const tabName = button.dataset.tab;

        tabsContainer.querySelectorAll('.calendar-tab-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        document.querySelectorAll('.calendar-tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`calendar-tab-${tabName}`).classList.add('active');
    });
}

function renderCalendarView() {
    if (!calendarInstance) {
        initializeCalendar();
    } else {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(getCalendarEvents());
    }
}

function getCalendarEvents() {
    const events = [];

    (appData.tasks || []).forEach(task => {
        if (task.prazo_final) {
            const client = appData.clients.find(c => c.id_cliente === task.id_cliente);
            events.push({
                title: `[T] ${task.titulo_tarefa}`,
                start: task.prazo_final,
                allDay: true,
                backgroundColor: '#3b82f6', // blue-500
                borderColor: '#2563eb', // blue-600
                extendedProps: {
                    type: 'task',
                    itemId: task.id_tarefa,
                    clientId: task.id_cliente,
                    clientName: client ? client.nome_empresa : 'N/A'
                }
            });
        }
    });

    (appData.tickets || []).forEach(ticket => {
        if (ticket.prazo_final) {
            const client = appData.clients.find(c => c.id_cliente === ticket.id_cliente);
            events.push({
                title: `[C] ${ticket.titulo_ticket}`,
                start: ticket.prazo_final,
                allDay: true,
                backgroundColor: '#f97316', // orange-500
                borderColor: '#ea580c', // orange-600
                extendedProps: {
                    type: 'ticket',
                    itemId: ticket.id_ticket,
                    clientId: ticket.id_cliente,
                    clientName: client ? client.nome_empresa : 'N/A'
                }
            });
        }
    });

    return events;
}

function initializeCalendar() {
    const calendarEl = document.getElementById('fullcalendar-container');
    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        locale: 'pt-br',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        buttonText: {
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            list: 'Lista'
        },
        events: getCalendarEvents(),
        eventClick: function (info) {
            const { type, itemId, clientId } = info.event.extendedProps;

            if (!clientId) {
                showToast('Cliente não encontrado para este evento.');
                return;
            }

            showClientModal(clientId, () => {
                const tabToClick = type === 'task' ? 'tasks' : 'tickets';
                const editorToShow = type === 'task' ? showTaskEditor : showTicketEditor;
                document.querySelector(`button[data-tab="${tabToClick}"]`).click();
                editorToShow(itemId);
            });
        },
        eventDidMount: function (info) {
            info.el.setAttribute('title', `${info.event.title}\nCliente: ${info.event.extendedProps.clientName}`);
        }
    });
    calendarInstance.render();
}

// ==========================================================
// FIM: FUNÇÕES DA NOVA VISÃO DE CALENDÁRIO
// ==========================================================

// ==========================================================
// INÍCIO: IMPLEMENTAÇÃO DO EDITOR DE TAREFAS/TICKETS
// ==========================================================

function showTaskEditor(taskId) {
    showItemEditor(taskId, 'task');
}

function showTicketEditor(ticketId) {
    showItemEditor(ticketId, 'ticket');
}

function showItemEditor(itemId, itemType) {
    const itemEditorModal = document.getElementById('item-editor-modal');
    const itemEditorContent = document.getElementById('item-editor-content');

    const isTask = itemType === 'task';
    const dataArray = isTask ? appData.tasks : appData.tickets;
    const idField = isTask ? 'id_tarefa' : 'id_ticket';
    const item = dataArray.find(i => i[idField] == itemId);

    if (!item) {
        showToast(`Erro: ${isTask ? 'Tarefa' : 'Ticket'} não encontrado(a).`);
        return;
    }

    const title = isTask ? item.titulo_tarefa : item.titulo_ticket;
    const description = item.descricao_detalhada;
    const modalTitle = isTask ? 'Editar Tarefa' : 'Editar Ticket';

    const usersOptions = appData.users.map(user =>
        `<option value="${user.id_usuario}" ${item.responsavel_id == user.id_usuario ? 'selected' : ''}>${user.nome_usuario}</option>`
    ).join('');
    const noResponsibleOption = `<option value="" ${!item.responsavel_id ? 'selected' : ''}>Sem responsável</option>`;

    itemEditorContent.innerHTML = `
        <div class="p-6 border-b flex justify-between items-center flex-shrink-0">
            <h3 class="text-2xl font-bold text-gray-800">${modalTitle}</h3>
            <button onclick="closeItemEditorModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div class="p-6 overflow-y-auto flex-grow">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Título</label>
                    <input type="text" id="item-editor-title" class="form-input" value="${title || ''}">
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Responsável</label>
                        <select id="item-editor-responsible" class="form-input !mt-0">${noResponsibleOption}${usersOptions}</select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Prazo Final</label>
                        <input type="date" id="item-editor-deadline" class="form-input !mt-0" value="${item.prazo_final || ''}">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                    <div id="item-editor-description" style="min-height: 200px;"></div>
                </div>
            </div>
        </div>
        <div class="p-4 border-t bg-slate-50 flex justify-end items-center gap-3 flex-shrink-0">
            <button type="button" onclick="closeItemEditorModal()" class="px-4 py-2 text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-full font-semibold">Cancelar</button>
            <button type="button" id="save-item-btn" class="px-4 py-2 text-white bg-[#2fc36a] hover:bg-[#29a85b] rounded-full font-semibold flex items-center justify-center">Salvar Alterações</button>
        </div>
    `;

    itemQuillEditor = new Quill('#item-editor-description', {
        theme: 'snow',
        modules: { toolbar: true }
    });
    if (description) {
        itemQuillEditor.root.innerHTML = description;
    }

    document.getElementById('save-item-btn').onclick = () => handleEditItem(itemId, itemType);

    itemEditorModal.classList.remove('hidden');
    requestAnimationFrame(() => {
        itemEditorContent.classList.remove('scale-95', 'opacity-0');
    });
}

async function handleEditItem(itemId, itemType) {
    const isTask = itemType === 'task';
    const tableName = isTask ? 'tarefas' : 'tickets';
    const idField = isTask ? 'id_tarefa' : 'id_ticket';
    const titleField = isTask ? 'titulo_tarefa' : 'titulo_ticket';

    const title = document.getElementById('item-editor-title').value;
    const responsibleId = document.getElementById('item-editor-responsible').value || null;
    const deadline = document.getElementById('item-editor-deadline').value || null;
    const description = itemQuillEditor.root.innerHTML;

    const updatedData = {
        [titleField]: title,
        responsavel_id: responsibleId,
        prazo_final: deadline,
        descricao_detalhada: description
    };

    const saveBtn = document.getElementById('save-item-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Salvando...';

    try {
        const { error } = await dbClient.from(tableName).update(updatedData).eq(idField, itemId);
        if (error) throw error;
        showToast(`${isTask ? 'Tarefa' : 'Ticket'} atualizado(a) com sucesso!`);
        closeItemEditorModal();
    } catch (error) {
        console.error(`Erro ao editar ${itemType}:`, error);
        showToast('Erro ao salvar alterações.');
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Salvar Alterações';
    }
}

function closeItemEditorModal() {
    const itemEditorModal = document.getElementById('item-editor-modal');
    const itemEditorContent = document.getElementById('item-editor-content');
    itemEditorContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        itemEditorModal.classList.add('hidden');
        itemEditorContent.innerHTML = '';
        itemQuillEditor = null;
    }, 300);
}

// ==========================================================
// FIM: IMPLEMENTAÇÃO DO EDITOR DE TAREFAS/TICKETS
// ==========================================================
