// --- CONFIGURAÇÃO E VARIÁVEIS GLOBAIS ---
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxR0sTr_AXocdDTGBRrQPYA1DHoiA6JNUZcyjvhWl_SymcG5leJxbBC6gq5-jzIyP3bQA/exec';
let appData = {};
let quillEditor = null;
let currentUser = null;
let deferredPrompt; 

// --- FUNÇÕES DE UTILIDADE ---
function jsonpRequest(url, callback) {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    window[callbackName] = function(data) {
        delete window[callbackName];
        if (document.body.contains(script)) {
            document.body.removeChild(script);
        }
        callback(null, data);
    };
    const script = document.createElement('script');
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
    script.onerror = () => callback(new Error('Falha ao carregar o script JSONP.'), null);
    document.body.appendChild(script);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('opacity-0', 'translate-y-2');
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
    }, 2000);
}

// --- LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO ---
function showApp(isInitialLoad = false) {
    const loginScreen = document.getElementById('login-screen');
    const loadingScreen = document.getElementById('loading-screen');
    const userInfo = document.getElementById('user-info');

    if (isInitialLoad) {
        loginScreen.classList.add('hidden');
        loadingScreen.classList.remove('hidden');
    }
    userInfo.innerHTML = `<div class="font-semibold text-gray-700">${currentUser.NomeUsuario}</div><div class="text-xs text-gray-500">${currentUser.Email}</div>`;
    initializeApp();
}

function showLogin() {
    const loginScreen = document.getElementById('login-screen');
    const loadingScreen = document.getElementById('loading-screen');
    const crmApp = document.getElementById('crm-app');

    localStorage.removeItem('crmUser');
    currentUser = null;
    crmApp.classList.add('hidden');
    loadingScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
}

function initializeApp() {
    const loadingScreen = document.getElementById('loading-screen');
    const crmApp = document.getElementById('crm-app');
    const kanbanBoard = document.getElementById('kanban-board');

    jsonpRequest(`${SCRIPT_URL}?action=getData`, (err, data) => {
        loadingScreen.classList.add('hidden');
        crmApp.classList.remove('hidden');

        if (err || data.success === false) {
            const msg = err ? err.message : data.message;
            kanbanBoard.innerHTML = `<div class="bg-red-100 text-red-700 p-4 rounded-lg"><b>Erro:</b> ${msg}</div>`;
            return;
        }
        appData = data;
        renderBoard();
    });
}

// --- RENDERIZAÇÃO DO QUADRO KANBAN E CARDS ---
function renderBoard(clientList = appData.clients) {
    const kanbanBoard = document.getElementById('kanban-board');
    kanbanBoard.innerHTML = '';
    appData.statuses.sort((a, b) => a.Ordem - b.Ordem).forEach(status => {
        const column = document.createElement('div');
        column.className = 'kanban-column bg-slate-100 rounded-lg p-3 w-[90vw] md:w-80 flex-shrink-0 flex flex-col transition-all duration-300 snap-center';
        const clientsInStatus = clientList.filter(c => c.Status === status.NomeStatus);
        column.innerHTML = `
            <div class="column-header-expanded flex justify-between items-center mb-3">
                <div class="flex items-center min-w-0"><h2 class="font-bold text-gray-700 truncate">${status.NomeStatus}</h2><span class="ml-2 bg-slate-200 text-slate-600 text-sm font-semibold rounded-full px-2">${clientsInStatus.length}</span></div>
                <button class="collapse-btn text-gray-400 hover:text-gray-600"><i class="fa-solid fa-angles-left"></i></button>
            </div>
            <div class="column-header-collapsed hidden flex-col items-center justify-between h-full">
                <div class="vertical-text font-bold text-gray-700">${status.NomeStatus}</div><span class="bg-slate-200 text-slate-600 text-sm font-semibold rounded-full w-6 h-6 flex items-center justify-center mb-2">${clientsInStatus.length}</span>
                <button class="collapse-btn text-gray-400 hover:text-gray-600"><i class="fa-solid fa-angles-left"></i></button>
            </div>
            <div class="kanban-cards min-h-[100px] flex-grow" data-status-name="${status.NomeStatus}"></div>`;
        const cardsContainer = column.querySelector('.kanban-cards');
        clientsInStatus.forEach(client => cardsContainer.appendChild(createClientCard(client)));
        kanbanBoard.appendChild(column);
    });
    initializeDragAndDrop();
    initializeColumnControls();
}

function initializeColumnControls() {
    document.querySelectorAll('.collapse-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); btn.closest('.kanban-column').classList.toggle('collapsed'); });
    });
    document.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('click', (e) => { if(column.classList.contains('collapsed')) { column.classList.remove('collapsed'); } })
    })
}

function formatTimeRemaining(dueDateString) {
    if (!dueDateString) return { text: '', colorClass: 'text-gray-500', pulse: false };
    const dueDate = new Date(dueDateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(23, 59, 59, 999);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: 'Atrasado', colorClass: 'text-red-500 font-semibold', pulse: true };
    if (diffDays === 0) return { text: 'Hoje', colorClass: 'text-red-500 font-semibold', pulse: true };
    if (diffDays <= 3) return { text: `Faltam ${diffDays} dias`, colorClass: 'text-red-500 font-semibold', pulse: true };
    if (diffDays <= 7) return { text: `Faltam ${diffDays} dias`, colorClass: 'text-yellow-600 font-semibold', pulse: false };
    return { text: `Faltam ${diffDays} dias`, colorClass: 'text-gray-500', pulse: false };
}

function createClientCard(client) {
    const card = document.createElement('div');
    card.className = 'kanban-card bg-white rounded-lg p-4 mb-3 border border-gray-200 hover:border-green-400 hover:shadow-md cursor-pointer transition-all';
    card.dataset.clientId = client.ID_Cliente;

    const clientTags = (appData.clientTags || []).filter(ct => ct.ID_Cliente === client.ID_Cliente).map(ct => (appData.tags || []).find(t => t.ID_Tag === ct.ID_Tag)).filter(Boolean);
    const tagsHtml = clientTags.map(tag => `<span class="text-xs font-medium mr-1 mb-1 px-2 py-0.5 rounded-full" style="background-color:${tag.Cor}20; color:${tag.Cor};">${tag.NomeTag}</span>`).join('');
    
    const progress = calculateProgress(client.ID_Cliente);

    const clientTasks = appData.tasks ? appData.tasks.filter(t => t.ID_Cliente === client.ID_Cliente && !t.Concluido && t.PrazoFinal) : [];
    clientTasks.sort((a, b) => new Date(a.PrazoFinal) - new Date(b.PrazoFinal));
    const nextTask = clientTasks[0];

    let nextTaskHtml = `<div class="text-sm text-gray-400 mt-3 pt-3 border-t border-gray-100">Nenhuma tarefa pendente com prazo.</div>`;

    if (nextTask) {
        const responsibleUser = appData.users.find(u => u.ID_Usuario === nextTask.Responsavel_ID);
        const timeInfo = formatTimeRemaining(nextTask.PrazoFinal);
        
        let userAvatarHtml = `<div class="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400 text-xs" title="Sem responsável"><i class="fas fa-user"></i></div>`;
        if (responsibleUser) {
            const userInitial = responsibleUser.NomeUsuario ? responsibleUser.NomeUsuario.charAt(0).toUpperCase() : '?';
            const fallbackAvatar = `<div class='w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold' title='${responsibleUser.NomeUsuario}'>${userInitial}</div>`;
            userAvatarHtml = responsibleUser.FotoURL 
                ? `<img src="${responsibleUser.FotoURL}" class="w-8 h-8 rounded-full flex-shrink-0 object-cover" title="${responsibleUser.NomeUsuario}" onerror="this.outerHTML = '${fallbackAvatar.replace(/"/g, '\\"')}'">`
                : fallbackAvatar;
        }
        
        nextTaskHtml = `
            <div class="mt-3 pt-3 border-t border-gray-100 group relative cursor-pointer" data-task-id="${nextTask.ID_Tarefa}">
                <div class="absolute inset-0 bg-green-100 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hidden md:flex items-center justify-center">
                    <span class="text-green-700 font-bold"><i class="fas fa-check mr-2"></i>Marcar como concluída?</span>
                </div>
                <p class="text-xs text-gray-400 font-semibold uppercase">Próxima Tarefa</p>
                <div class="flex items-center justify-between mt-2">
                    <div class="break-words w-full pr-2">
                        <span class="text-sm text-gray-700 font-medium">${nextTask.TituloTarefa}</span>
                        <p class="text-sm mt-1 ${timeInfo.colorClass} ${timeInfo.pulse ? 'pulse-animation' : ''}">${timeInfo.text}</p>
                    </div>
                    ${userAvatarHtml}
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <h3 class="font-semibold text-gray-800 truncate">${client.NomeEmpresa}</h3>
        <p class="text-sm text-gray-500 mb-3"><i class="fas fa-user mr-2 text-gray-400"></i>${client.NomeResponsavel}</p>
        <div class="flex flex-wrap gap-y-1 mb-3">${tagsHtml}</div>
        <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-green-500 h-2 rounded-full" style="width: ${progress}%"></div></div>
        ${nextTaskHtml}
    `;
    
    card.addEventListener('click', (e) => { e.stopPropagation(); showClientModal(client.ID_Cliente); });
    
    const quickCompleteContainer = card.querySelector('.group[data-task-id]');
    if (quickCompleteContainer) {
        if (window.innerWidth >= 768) {
            quickCompleteContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                handleToggleTask(e.currentTarget.dataset.taskId, true);
                showToast('Tarefa concluída!');
            });
        }
    }
    return card;
}

// --- FUNÇÕES DE LÓGICA (MODAL, TAREFAS, ETC.) ---

function calculateProgress(clientId) {
    const tasks = appData.tasks ? appData.tasks.filter(p => p.ID_Cliente === clientId) : [];
    if (tasks.length === 0) return 0;
    const completedTasks = tasks.filter(p => p.Concluido).length;
    return Math.round((completedTasks / tasks.length) * 100);
}

function initializeDragAndDrop() {
    document.querySelectorAll('.kanban-cards').forEach(column => {
        new Sortable(column, {
            group: 'kanban',
            animation: 150,
            delay: 200, 
            delayOnTouchOnly: true, 
            onEnd: (evt) => {
                const { item, to, from } = evt;
                const clientId = item.dataset.clientId;
                const newStatus = to.dataset.statusName;
                
                const client = appData.clients.find(c => c.ID_Cliente.toString() === clientId);
                if (client) {
                    client.Status = newStatus;
                }

                const updateUrl = `${SCRIPT_URL}?action=updateClientStatus&clientId=${encodeURIComponent(clientId)}&newStatus=${encodeURIComponent(newStatus)}`;
                jsonpRequest(updateUrl, (err, data) => {
                    if (err || !data.success) {
                        showToast('Erro ao atualizar status.');
                        const client = appData.clients.find(c => c.ID_Cliente.toString() === clientId);
                        if (client) {
                            client.Status = from.dataset.statusName;
                        }
                        from.appendChild(item);
                    }
                    renderBoard();
                });
            }
        });
    });
}

function showClientModal(clientId) {
    const client = appData.clients.find(c => c.ID_Cliente === clientId);
    if (!client) return;

    const modalContent = document.getElementById('modal-content');
    const loaderTemplate = document.getElementById('loader-template');
    const clientModal = document.getElementById('client-modal');

    modalContent.innerHTML = '';
    modalContent.appendChild(loaderTemplate.content.cloneNode(true));
    clientModal.classList.remove('hidden');
    setTimeout(() => modalContent.classList.remove('scale-95', 'opacity-0'), 10);

    modalContent.innerHTML = `
        <div class="p-6 border-b">
            <div class="flex justify-between items-start">
                <div><h2 class="text-3xl font-bold text-gray-800">${client.NomeEmpresa}</h2></div>
                <button id="close-modal-btn" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
        </div>
        <div class="border-b border-gray-200">
            <nav id="modal-tabs" class="flex space-x-4 px-6 -mb-px overflow-x-auto">
                <button data-tab="details" class="tab-button active flex-shrink-0">Detalhes</button>
                <button data-tab="tasks" class="tab-button flex-shrink-0">Tarefas</button>
                <button data-tab="tickets" class="tab-button flex-shrink-0">Tickets</button>
            </nav>
        </div>
        <div class="p-6 overflow-y-auto flex-grow">
            <div id="tab-content-details" class="tab-content active">
                <div id="modal-form" data-client-id="${clientId}">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div><label class="text-sm font-medium text-gray-700">Nome da Empresa</label><input type="text" id="modal-NomeEmpresa" value="${client.NomeEmpresa || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">CNPJ</label><input type="text" id="modal-CNPJ" value="${client.CNPJ || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">Nome do Responsável</label><input type="text" id="modal-NomeResponsavel" value="${client.NomeResponsavel || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">WhatsApp</label><input type="text" id="modal-WhatsApp" value="${client.WhatsApp || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">E-mail Financeiro</label><input type="text" id="modal-EmailFinanceiro" value="${client.EmailFinanceiro || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">Telefone do Dono</label><input type="text" id="modal-TelefoneDono" value="${client.TelefoneDono || ''}" class="form-input"></div>
                        <div class="md:col-span-2"><label class="text-sm font-medium text-gray-700">Link do Grupo WhatsApp</label><input type="text" id="modal-LinkGrupoWhatsApp" value="${client.LinkGrupoWhatsApp || ''}" class="form-input"></div>
                        <div><label class="text-sm font-medium text-gray-700">Valor do Contrato</label><input type="text" id="modal-ValorContrato" value="${client.ValorContrato || ''}" class="form-input" placeholder="R$ 0,00"></div>
                        <div class="md:col-span-2"><label class="text-sm font-medium text-gray-700">Anotações</label><textarea id="modal-Anotacoes" rows="4" class="form-input">${client.Anotacoes || ''}</textarea></div>
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
                <div id="task-list-container" class="bg-slate-50 p-4 rounded-lg"></div>
                <div id="task-editor-container" class="mt-4 border-t pt-4 hidden"></div>
            </div>
            <div id="tab-content-tickets" class="tab-content">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-gray-600">Tickets/Chamados</h4>
                    <button id="add-main-ticket-btn" class="bg-[#2fc36a] hover:bg-[#29a85b] text-white text-sm font-bold py-1 px-3 rounded-full flex items-center"><i class="fas fa-plus mr-2"></i>Novo Ticket</button>
                </div>
                <div id="ticket-list-container" class="bg-slate-50 p-4 rounded-lg"></div>
                <div id="ticket-editor-container" class="mt-4 border-t pt-4 hidden"></div>
            </div>
        </div>`;
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
    document.getElementById('add-main-task-btn').addEventListener('click', () => showNewTaskForm(clientId, '0'));
    document.getElementById('add-main-ticket-btn').addEventListener('click', () => showNewTicketForm(clientId, '0'));
}

function hideClientModal() {
    const clientModal = document.getElementById('client-modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        clientModal.classList.add('hidden');
        renderBoard();
    }, 300);
}

function renderTaskList(clientId) {
    const container = document.getElementById('task-list-container');
    const clientTasks = appData.tasks ? appData.tasks.filter(t => t.ID_Cliente === clientId) : [];

    function buildTaskTree(parentId) {
        const tasks = clientTasks.filter(task => {
            if (parentId === '0') return task.Parent_ID_Tarefa == '0' || !task.Parent_ID_Tarefa;
            return task.Parent_ID_Tarefa === parentId;
        });
        if (tasks.length === 0) return '';
        let html = `<div class="${parentId !== '0' ? 'ml-6 border-l-2 border-gray-200 pl-4' : ''}">`;
        tasks.sort((a,b) => a.Ordem - b.Ordem).forEach(task => {
            const responsibleUser = appData.users.find(u => u.ID_Usuario === task.Responsavel_ID);
            const dueDate = task.PrazoFinal ? new Date(task.PrazoFinal) : null;
            const today = new Date();
            today.setHours(0,0,0,0);
            const isOverdue = dueDate && dueDate < today;
            html += `
                <div class="task-item group flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                    <div class="flex items-center flex-grow min-w-0">
                        <input type="checkbox" data-task-id="${task.ID_Tarefa}" class="task-checkbox h-4 w-4 mr-3 flex-shrink-0" ${task.Concluido ? 'checked' : ''}>
                        <div class="truncate">
                            <span class="task-title ${task.Concluido ? 'line-through text-gray-400' : ''}">${task.TituloTarefa}</span>
                            ${dueDate ? `<span class="ml-2 text-xs ${isOverdue ? 'text-red-500' : 'text-gray-500'}"><i class="far fa-calendar-alt mr-1"></i>${dueDate.toLocaleDateString('pt-BR')}</span>` : ''}
                        </div>
                        ${responsibleUser ? `<span class="ml-2 text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">${responsibleUser.NomeUsuario}</span>` : ''}
                    </div>
                    <div class="task-controls opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button title="Adicionar Subtarefa" class="add-subtask-btn text-gray-400 hover:text-green-500 p-1" data-parent-id="${task.ID_Tarefa}"><i class="fas fa-plus-circle"></i></button>
                        <button title="Editar Tarefa" class="edit-task-btn text-gray-400 hover:text-blue-500 p-1" data-task-id="${task.ID_Tarefa}"><i class="fas fa-pencil-alt"></i></button>
                        <button title="Apagar Tarefa" class="delete-task-btn text-gray-400 hover:text-red-500 p-1" data-task-id="${task.ID_Tarefa}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            html += buildTaskTree(task.ID_Tarefa);
        });
        html += `</div>`;
        return html;
    }
    container.innerHTML = buildTaskTree('0') || '<p class="text-gray-500">Nenhuma tarefa criada para este cliente.</p>';
    container.querySelectorAll('.task-checkbox').forEach(cb => cb.addEventListener('change', (e) => handleToggleTask(e.target.dataset.taskId, e.target.checked)));
    container.querySelectorAll('.add-subtask-btn').forEach(btn => btn.addEventListener('click', (e) => showNewTaskForm(clientId, e.currentTarget.dataset.parentId)));
    container.querySelectorAll('.edit-task-btn').forEach(btn => btn.addEventListener('click', (e) => showTaskEditor(e.currentTarget.dataset.taskId)));
    container.querySelectorAll('.delete-task-btn').forEach(btn => btn.addEventListener('click', (e) => handleDeleteTask(e.currentTarget.dataset.taskId)));
}

function showTaskEditor(taskId) {
    const editorContainer = document.getElementById('task-editor-container');
    const task = appData.tasks.find(t => t.ID_Tarefa === taskId);
    if (!task) return;
    const userOptions = appData.users.map(user => `<option value="${user.ID_Usuario}" ${task.Responsavel_ID === user.ID_Usuario ? 'selected' : ''}>${user.NomeUsuario}</option>`).join('');
    const dueDateValue = task.PrazoFinal ? new Date(task.PrazoFinal).toISOString().split('T')[0] : '';
    editorContainer.innerHTML = `
        <h5 class="font-bold text-lg mb-2">Editando Tarefa</h5>
        <input type="text" id="editor-task-title" value="${task.TituloTarefa}" class="form-input w-full mb-2 text-lg font-semibold" placeholder="Título da Tarefa">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label class="text-sm font-medium text-gray-700">Responsável</label><select id="editor-task-responsible" class="form-input"><option value="">Ninguém</option>${userOptions}</select></div>
            <div>
                <label class="text-sm font-medium text-gray-700">Prazo Final</label>
                <input type="date" id="editor-task-due-date" value="${dueDateValue}" class="form-input">
                <div class="flex space-x-2 mt-2">
                    <button class="suggestion-btn" data-days="3">+3 dias</button>
                    <button class="suggestion-btn" data-days="7">+7 dias</button>
                </div>
            </div>
        </div>
        <div class="mt-4" id="quill-editor-task"></div>
        <div class="flex justify-end mt-2">
            <button id="save-task-btn" class="bg-[#2fc36a] hover:bg-[#29a85b] text-white font-bold py-2 px-4 rounded-full">Salvar Tarefa</button>
        </div>
    `;
    editorContainer.classList.remove('hidden');
    quillEditor = new Quill('#quill-editor-task', { theme: 'snow' });
    if (task.DescricaoDetalhada) quillEditor.root.innerHTML = task.DescricaoDetalhada;
    editorContainer.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const daysToAdd = parseInt(btn.dataset.days);
            const dateInput = document.getElementById('editor-task-due-date');
            const newDate = new Date();
            newDate.setDate(newDate.getDate() + daysToAdd);
            dateInput.value = newDate.toISOString().split('T')[0];
        });
    });
    document.getElementById('save-task-btn').addEventListener('click', () => handleSaveTask(taskId));
}

function handleSaveTask(taskId) {
    const title = document.getElementById('editor-task-title').value;
    const description = quillEditor.root.innerHTML;
    const responsibleId = document.getElementById('editor-task-responsible').value;
    const dueDate = document.getElementById('editor-task-due-date').value;
    const task = appData.tasks.find(t => t.ID_Tarefa === taskId);
    const client = appData.clients.find(c => c.ID_Cliente === task.ID_Cliente);
    task.TituloTarefa = title;
    task.DescricaoDetalhada = description;
    task.Responsavel_ID = responsibleId;
    task.PrazoFinal = dueDate;
    renderBoard();
    showClientModal(client.ID_Cliente);
    setTimeout(() => document.querySelector('button[data-tab="tasks"]').click(), 50);
    const url = `${SCRIPT_URL}?action=updateTask&ID_Tarefa=${taskId}&TituloTarefa=${encodeURIComponent(title)}&DescricaoDetalhada=${encodeURIComponent(description)}&Responsavel_ID=${encodeURIComponent(responsibleId)}&PrazoFinal=${encodeURIComponent(dueDate)}`;
    jsonpRequest(url, (err, data) => { if (err || !data.success) { showToast("Erro ao salvar a tarefa."); initializeApp(); } });
}

function showNewTaskForm(clientId, parentId) {
    if (document.getElementById('new-task-form')) return;
    const targetContainer = parentId !== '0' ? document.querySelector(`.add-subtask-btn[data-parent-id="${parentId}"]`).closest('.task-item').parentNode : document.getElementById('task-list-container');
    const formHtml = `<form id="new-task-form" class="p-2"><input type="text" id="new-task-input" class="form-input w-full" placeholder="Escreva o título e prima Enter"></form>`;
    targetContainer.insertAdjacentHTML(parentId !== '0' ? 'beforeend' : 'afterbegin', formHtml);
    const form = document.getElementById('new-task-form');
    const input = document.getElementById('new-task-input');
    input.focus();
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = input.value.trim();
        if (title) { handleCreateTask(clientId, parentId, title); }
        form.remove();
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (document.getElementById('new-task-form')) document.getElementById('new-task-form').remove(); }, 150); });
}

function handleCreateTask(clientId, parentId, title) {
    let url = `${SCRIPT_URL}?action=createTask&ID_Cliente=${clientId}&TituloTarefa=${encodeURIComponent(title)}`;
    if (parentId && parentId !== '0') url += `&Parent_ID_Tarefa=${parentId}`;
    jsonpRequest(url, (err, data) => {
        if (err || !data.success) { showToast("Erro ao criar a tarefa."); } 
        else {
            appData.tasks.push(data.newTask);
            renderBoard();
            showClientModal(clientId);
            setTimeout(() => document.querySelector('button[data-tab="tasks"]').click(), 50);
        }
    });
}

function handleToggleTask(taskId, isCompleted) {
    const task = appData.tasks.find(t => t.ID_Tarefa === taskId);
    const originalState = task.Concluido;
    task.Concluido = isCompleted;
    renderBoard();
    if(!clientModal.classList.contains('hidden')) { renderTaskList(task.ID_Cliente); }
    const url = `${SCRIPT_URL}?action=updateTask&ID_Tarefa=${taskId}&Concluido=${isCompleted}`;
    jsonpRequest(url, (err, data) => {
        if (err || !data.success) {
            showToast("Erro ao atualizar o status da tarefa.");
            task.Concluido = originalState;
            renderBoard();
            if(!clientModal.classList.contains('hidden')) { renderTaskList(task.ID_Cliente); }
        }
    });
}

function handleDeleteTask(taskId) {
    if (!confirm("Tem a certeza de que quer apagar esta tarefa e todas as suas subtarefas?")) return;
    const task = appData.tasks.find(t => t.ID_Tarefa === taskId);
    const originalTasks = [...appData.tasks];
    const tasksToRemove = [taskId];
    let i = 0;
    while (i < tasksToRemove.length) {
        const parentId = tasksToRemove[i];
        appData.tasks.filter(t => t.Parent_ID_Tarefa === parentId).forEach(child => tasksToRemove.push(child.ID_Tarefa));
        i++;
    }
    appData.tasks = appData.tasks.filter(t => !tasksToRemove.includes(t.ID_Tarefa));
    renderBoard();
    showClientModal(task.ID_Cliente);
    setTimeout(() => document.querySelector('button[data-tab="tasks"]').click(), 50);
    const url = `${SCRIPT_URL}?action=deleteTask&ID_Tarefa=${taskId}`;
    jsonpRequest(url, (err, data) => {
        if (err || !data.success) {
            showToast("Erro ao apagar a tarefa.");
            appData.tasks = originalTasks;
            renderBoard();
            showClientModal(task.ID_Cliente);
            setTimeout(() => document.querySelector('button[data-tab="tasks"]').click(), 50);
        }
    });
}

// --- NOVAS FUNÇÕES PARA TICKETS ---
function renderTicketList(clientId) {
    const container = document.getElementById('ticket-list-container');
    const clientTickets = appData.tickets ? appData.tickets.filter(t => t.ID_Cliente === clientId) : [];

    function buildTicketTree(parentId) {
        const tickets = clientTickets.filter(ticket => {
            if (parentId === '0') return ticket.Parent_ID_Ticket == '0' || !ticket.Parent_ID_Ticket;
            return ticket.Parent_ID_Ticket === parentId;
        });
        if (tickets.length === 0) return '';
        let html = `<div class="${parentId !== '0' ? 'ml-6 border-l-2 border-gray-200 pl-4' : ''}">`;
        tickets.sort((a,b) => a.Ordem - b.Ordem).forEach(ticket => {
            const responsibleUser = appData.users.find(u => u.ID_Usuario === ticket.Responsavel_ID);
            const dueDate = ticket.PrazoFinal ? new Date(ticket.PrazoFinal) : null;
            const today = new Date();
            today.setHours(0,0,0,0);
            const isOverdue = dueDate && dueDate < today;
            html += `
                <div class="task-item group flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                    <div class="flex items-center flex-grow min-w-0">
                        <input type="checkbox" data-ticket-id="${ticket.ID_Ticket}" class="ticket-checkbox h-4 w-4 mr-3 flex-shrink-0" ${ticket.Concluido ? 'checked' : ''}>
                        <div class="truncate">
                            <span class="ticket-title ${ticket.Concluido ? 'line-through text-gray-400' : ''}">${ticket.TituloTicket}</span>
                            ${dueDate ? `<span class="ml-2 text-xs ${isOverdue ? 'text-red-500' : 'text-gray-500'}"><i class="far fa-calendar-alt mr-1"></i>${dueDate.toLocaleDateString('pt-BR')}</span>` : ''}
                        </div>
                        ${responsibleUser ? `<span class="ml-2 text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">${responsibleUser.NomeUsuario}</span>` : ''}
                    </div>
                    <div class="task-controls opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button title="Adicionar Sub-ticket" class="add-subticket-btn text-gray-400 hover:text-green-500 p-1" data-parent-id="${ticket.ID_Ticket}"><i class="fas fa-plus-circle"></i></button>
                        <button title="Editar Ticket" class="edit-ticket-btn text-gray-400 hover:text-blue-500 p-1" data-ticket-id="${ticket.ID_Ticket}"><i class="fas fa-pencil-alt"></i></button>
                        <button title="Apagar Ticket" class="delete-ticket-btn text-gray-400 hover:text-red-500 p-1" data-ticket-id="${ticket.ID_Ticket}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            html += buildTicketTree(ticket.ID_Ticket);
        });
        html += `</div>`;
        return html;
    }
    container.innerHTML = buildTicketTree('0') || '<p class="text-gray-500">Nenhum ticket criado para este cliente.</p>';
    container.querySelectorAll('.ticket-checkbox').forEach(cb => cb.addEventListener('change', (e) => handleToggleTicket(e.target.dataset.ticketId, e.target.checked)));
    container.querySelectorAll('.add-subticket-btn').forEach(btn => btn.addEventListener('click', (e) => showNewTicketForm(clientId, e.currentTarget.dataset.parentId)));
    container.querySelectorAll('.edit-ticket-btn').forEach(btn => btn.addEventListener('click', (e) => showTicketEditor(e.currentTarget.dataset.ticketId)));
    container.querySelectorAll('.delete-ticket-btn').forEach(btn => btn.addEventListener('click', (e) => handleDeleteTicket(e.currentTarget.dataset.ticketId)));
}

function showTicketEditor(ticketId) {
    const editorContainer = document.getElementById('ticket-editor-container');
    const ticket = appData.tickets.find(t => t.ID_Ticket === ticketId);
    if (!ticket) return;
    const userOptions = appData.users.map(user => `<option value="${user.ID_Usuario}" ${ticket.Responsavel_ID === user.ID_Usuario ? 'selected' : ''}>${user.NomeUsuario}</option>`).join('');
    const dueDateValue = ticket.PrazoFinal ? new Date(ticket.PrazoFinal).toISOString().split('T')[0] : '';
    editorContainer.innerHTML = `
        <h5 class="font-bold text-lg mb-2">Editando Ticket</h5>
        <input type="text" id="editor-ticket-title" value="${ticket.TituloTicket}" class="form-input w-full mb-2 text-lg font-semibold" placeholder="Título do Ticket">
        <div class="grid grid-cols-2 gap-4">
            <div><label class="text-sm font-medium text-gray-700">Responsável</label><select id="editor-ticket-responsible" class="form-input"><option value="">Ninguém</option>${userOptions}</select></div>
            <div>
                <label class="text-sm font-medium text-gray-700">Prazo Final</label>
                <input type="date" id="editor-ticket-due-date" value="${dueDateValue}" class="form-input">
                <div class="flex space-x-2 mt-2"> <button class="suggestion-btn" data-days="3">+3 dias</button> <button class="suggestion-btn" data-days="7">+7 dias</button> </div>
            </div>
        </div>
        <div class="mt-4" id="quill-editor-ticket"></div>
        <div class="flex justify-end mt-2"> <button id="save-ticket-btn" class="bg-[#2fc36a] hover:bg-[#29a85b] text-white font-bold py-2 px-4 rounded-full">Salvar Ticket</button> </div>
    `;
    editorContainer.classList.remove('hidden');
    quillEditor = new Quill('#quill-editor-ticket', { theme: 'snow' });
    if (ticket.DescricaoDetalhada) quillEditor.root.innerHTML = ticket.DescricaoDetalhada;
    editorContainer.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const daysToAdd = parseInt(btn.dataset.days);
            const dateInput = document.getElementById('editor-ticket-due-date');
            const newDate = new Date();
            newDate.setDate(newDate.getDate() + daysToAdd);
            dateInput.value = newDate.toISOString().split('T')[0];
        });
    });
    document.getElementById('save-ticket-btn').addEventListener('click', () => handleSaveTicket(ticketId));
}

function handleSaveTicket(ticketId) {
    const title = document.getElementById('editor-ticket-title').value;
    const description = quillEditor.root.innerHTML;
    const responsibleId = document.getElementById('editor-ticket-responsible').value;
    const dueDate = document.getElementById('editor-ticket-due-date').value;
    const ticket = appData.tickets.find(t => t.ID_Ticket === ticketId);
    const client = appData.clients.find(c => c.ID_Cliente === ticket.ID_Cliente);
    ticket.TituloTicket = title;
    ticket.DescricaoDetalhada = description;
    ticket.Responsavel_ID = responsibleId;
    ticket.PrazoFinal = dueDate;
    renderBoard();
    showClientModal(client.ID_Cliente);
    setTimeout(() => document.querySelector('button[data-tab="tickets"]').click(), 50);
    const url = `${SCRIPT_URL}?action=updateTicket&ID_Ticket=${ticketId}&TituloTicket=${encodeURIComponent(title)}&DescricaoDetalhada=${encodeURIComponent(description)}&Responsavel_ID=${encodeURIComponent(responsibleId)}&PrazoFinal=${encodeURIComponent(dueDate)}`;
    jsonpRequest(url, (err, data) => { if (err || !data.success) { showToast("Erro ao salvar o ticket."); initializeApp(); } });
}

function showNewTicketForm(clientId, parentId) {
    if (document.getElementById('new-ticket-form')) return;
    const targetContainer = parentId !== '0' ? document.querySelector(`.add-subticket-btn[data-parent-id="${parentId}"]`).closest('.task-item').parentNode : document.getElementById('ticket-list-container');
    const formHtml = `<form id="new-ticket-form" class="p-2"><input type="text" id="new-ticket-input" class="form-input w-full" placeholder="Escreva o título e prima Enter"></form>`;
    targetContainer.insertAdjacentHTML(parentId !== '0' ? 'beforeend' : 'afterbegin', formHtml);
    const form = document.getElementById('new-ticket-form');
    const input = document.getElementById('new-ticket-input');
    input.focus();
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = input.value.trim();
        if (title) { handleCreateTicket(clientId, parentId, title); }
        form.remove();
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (document.getElementById('new-ticket-form')) document.getElementById('new-ticket-form').remove(); }, 150); });
}

function handleCreateTicket(clientId, parentId, title) {
    let url = `${SCRIPT_URL}?action=createTicket&ID_Cliente=${clientId}&TituloTicket=${encodeURIComponent(title)}`;
    if (parentId && parentId !== '0') url += `&Parent_ID_Ticket=${parentId}`;
    jsonpRequest(url, (err, data) => {
        if (err || !data.success) { showToast("Erro ao criar o ticket."); } 
        else {
            appData.tickets.push(data.newTicket);
            renderBoard();
            showClientModal(clientId);
            setTimeout(() => document.querySelector('button[data-tab="tickets"]').click(), 50);
        }
    });
}

function handleToggleTicket(ticketId, isCompleted) {
    const ticket = appData.tickets.find(t => t.ID_Ticket === ticketId);
    const originalState = ticket.Concluido;
    ticket.Concluido = isCompleted;
    renderBoard();
    if(!clientModal.classList.contains('hidden')) { renderTicketList(ticket.ID_Cliente); }
    const url = `${SCRIPT_URL}?action=updateTicket&ID_Ticket=${ticketId}&Concluido=${isCompleted}`;
    jsonpRequest(url, (err, data) => {
        if (err || !data.success) {
            showToast("Erro ao atualizar o status do ticket.");
            ticket.Concluido = originalState;
            renderBoard();
            if(!clientModal.classList.contains('hidden')) { renderTicketList(ticket.ID_Cliente); }
        }
    });
}

function handleDeleteTicket(ticketId) {
    if (!confirm("Tem a certeza de que quer apagar este ticket e todos os seus sub-tickets?")) return;
    const ticket = appData.tickets.find(t => t.ID_Ticket === ticketId);
    const originalTickets = [...appData.tickets];
    const ticketsToRemove = [ticketId];
    let i = 0;
    while (i < ticketsToRemove.length) {
        const parentId = ticketsToRemove[i];
        appData.tickets.filter(t => t.Parent_ID_Ticket === parentId).forEach(child => ticketsToRemove.push(child.ID_Ticket));
        i++;
    }
    appData.tickets = appData.tickets.filter(t => !ticketsToRemove.includes(t.ID_Ticket));
    renderBoard();
    showClientModal(ticket.ID_Cliente);
    setTimeout(() => document.querySelector('button[data-tab="tickets"]').click(), 50);
    const url = `${SCRIPT_URL}?action=deleteTicket&ID_Ticket=${ticketId}`;
    jsonpRequest(url, (err, data) => {
        if (err || !data.success) {
            showToast("Erro ao apagar o ticket.");
            appData.tickets = originalTickets;
            renderBoard();
            showClientModal(ticket.ID_Cliente);
            setTimeout(() => document.querySelector('button[data-tab="tickets"]').click(), 50);
        }
    });
}
// --- FIM: NOVAS FUNÇÕES PARA TICKETS ---

// --- FUNÇÃO DE SALVAR CLIENTE ATUALIZADA ---
function handleSaveClient(clientId) {
    const saveBtn = document.getElementById('save-client-btn');
    const saveStatus = document.getElementById('save-status');
    saveBtn.disabled = true;
    saveStatus.textContent = 'Salvando...';
    
    const fieldsToUpdate = [
        'NomeEmpresa', 'CNPJ', 'NomeResponsavel', 'WhatsApp', 
        'EmailFinanceiro', 'TelefoneDono', 'LinkGrupoWhatsApp',
        'ValorContrato', 'Anotacoes'
    ];
    let updateUrl = `${SCRIPT_URL}?action=updateClientData&clientId=${encodeURIComponent(clientId)}`;
    const updatedData = {};
    
    fieldsToUpdate.forEach(field => {
        const value = document.getElementById(`modal-${field}`).value;
        updateUrl += `&${encodeURIComponent(field)}=${encodeURIComponent(value)}`;
        updatedData[field] = value;
    });
    
    jsonpRequest(updateUrl, (err, data) => {
        saveBtn.disabled = false;
        if (err || !data.success) {
            saveStatus.textContent = 'Erro ao salvar!';
            setTimeout(() => saveStatus.textContent = '', 2000);
        } else {
            saveStatus.textContent = 'Salvo com sucesso!';
            const clientInState = appData.clients.find(c => c.ID_Cliente === clientId);
            if (clientInState) {
                Object.assign(clientInState, updatedData);
            }
            setTimeout(() => hideClientModal(), 1000);
        }
    });
}
