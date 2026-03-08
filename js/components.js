/**
 * Wago CRM Reusable Components
 */

const WagoComponents = {
    // Toast system
    toastContainer: null,

    createToastContainer() {
        if (this.toastContainer) return;
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'toast-container';
        this.toastContainer.className = 'fixed bottom-8 right-8 z-[100] flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(this.toastContainer);

        const style = document.createElement('style');
        style.textContent = `
            #toast-container > div {
                animation: toast-in 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
            }
            @keyframes toast-in {
                from { transform: translateX(100%) scale(0.9); opacity: 0; }
                to { transform: translateX(0) scale(1); opacity: 1; }
            }
            .toast-out {
                animation: toast-out 0.3s ease-in forwards !important;
            }
            @keyframes toast-out {
                from { transform: translateX(0) scale(1); opacity: 1; }
                to { transform: translateX(100%) scale(0.9); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    },

    showToast(title, message, icon = 'info', type = 'primary') {
        this.createToastContainer();
        const toast = document.createElement('div');
        toast.className = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-4 pr-10 flex items-start gap-4 pointer-events-auto min-w-[300px] relative overflow-hidden group';

        const iconColors = {
            primary: 'bg-primary text-white',
            success: 'bg-green-500 text-white',
            info: 'bg-blue-500 text-white',
            warning: 'bg-amber-500 text-white'
        };

        toast.innerHTML = `
            <div class="size-10 rounded-xl ${iconColors[type] || iconColors.primary} flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined">${icon}</span>
            </div>
            <div>
                <p class="font-black text-sm text-slate-900 dark:text-white">${title}</p>
                <p class="text-xs text-slate-500 font-medium">${message}</p>
            </div>
            <button class="absolute top-2 right-2 text-slate-300 hover:text-slate-500 dark:hover:text-slate-100 p-1 rounded-lg transition-colors">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
            <div class="absolute bottom-0 left-0 h-1 bg-primary/20 w-full">
                <div class="h-full bg-primary transition-all duration-[5000ms] linear w-full" id="toast-progress"></div>
            </div>
        `;

        this.toastContainer.appendChild(toast);

        const remove = () => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        };

        toast.querySelector('button').onclick = remove;
        setTimeout(() => {
            if (toast.parentNode) remove();
        }, 5000);
    },

    sidebar: (activePage) => {
        const links = [
            { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', href: 'dashboard.html' },
            { id: 'leads', icon: 'group', label: 'Leads', href: 'leads.html' },
            { id: 'pipeline', icon: 'filter_alt', label: 'Pipeline', href: 'pipeline.html' },
            { id: 'automation', icon: 'bolt', label: 'Automation', href: 'automation.html' },
            { id: 'whatsapp', icon: 'whatsapp', label: 'Connect Whatsapp', href: 'whatsapp.html' }
        ];

        let navLinks = links.map(link => {
            const iconHtml = link.icon === 'whatsapp' ? `
                <svg class="size-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.004 2C6.48 2 2.004 6.477 2.004 12c0 1.892.534 3.657 1.464 5.161l-1.464 5.343 5.519-1.448c1.415.772 3.033 1.21 4.75 1.21 5.524 0 10-4.477 10-10s-4.476-10-10-10z" fill="#25D366"/>
                    <path d="M17.507 14.307c-.21-.107-1.24-.614-1.432-.681-.191-.069-.331-.107-.469.107-.141.21-.541.681-.663.82-.122.139-.245.155-.456.05-.21-.107-.887-.327-1.692-1.042-.625-.558-1.048-1.247-1.171-1.458-.122-.21-.013-.324.092-.429.095-.095.21-.246.315-.369.105-.122.141-.21.21-.349.068-.141.034-.265-.017-.373-.05-.107-.469-1.135-.643-1.554-.17-.41-.358-.354-.469-.359-.122-.005-.262-.005-.403-.005-.141 0-.37.054-.564.267-.194.21-.741.724-.741 1.764s.755 2.049.86 2.19c.106.141 1.487 2.27 3.593 3.181.5.216.892.344 1.192.44.507.161.968.138 1.332.084.407-.061 1.24-.507 1.415-1.002.174-.492.174-.915.122-1.002-.054-.084-.191-.122-.401-.229z" fill="#fff"/>
                </svg>
            ` : `<span class="material-symbols-outlined">${link.icon}</span>`;

            return `
                <a class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${activePage === link.id ? 'bg-primary/10 text-primary font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary'} transition-all font-bold"
                    href="${link.href}">
                    ${iconHtml}
                    <span class="text-sm">${link.label}</span>
                </a>
            `;
        }).join('');

        return `
            <aside class="w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full z-30">
                <div class="p-8 flex items-center gap-3">
                    <div class="size-12 rounded-2xl overflow-hidden shadow-lg shadow-primary/20">
                        <img src="${WagoData.settings.businessLogo || 'img/logo.jpg'}" class="w-full h-full object-cover" alt="Business Logo" id="sidebar-logo">
                    </div>
                    <div>
                        <h1 class="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Zokata</h1>
                        <p class="text-[10px] uppercase tracking-widest font-bold text-primary">WhatsApp CRM</p>
                    </div>
                </div>

                <nav class="flex-1 px-4 space-y-1.5 overflow-y-auto pt-4">
                    ${navLinks}

                    <div class="pt-8 mt-8 border-t border-slate-100 dark:border-slate-800">
                        <p class="px-4 text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-4">Account</p>
                         <a class="flex items-center gap-4 px-4 py-3.5 rounded-2xl ${activePage === 'settings' ? 'bg-primary/10 text-primary font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary'} transition-all font-bold"
                            href="settings.html">
                            <span class="material-symbols-outlined">settings</span>
                            <span class="text-sm">Settings</span>
                        </a>
                        <button onclick="ZokatAuth.logout()" class="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all font-bold text-left">
                            <span class="material-symbols-outlined">logout</span>
                            <span class="text-sm">Logout</span>
                        </button>
                    </div>
                </nav>

                <div class="p-6">
                    <div class="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-[1.5rem] border border-slate-100 dark:border-slate-800">
                        <div class="size-12 rounded-full bg-primary/20 flex items-center justify-center text-primary border-2 border-white dark:border-slate-900 shadow-sm">
                            <span class="material-symbols-outlined">person</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-slate-900 dark:text-white truncate" id="sidebar-user-name">${WagoData.settings.companyName || 'Business'}</p>
                            <span class="text-[10px] font-black text-primary uppercase tracking-tighter">${ZokatAuth.getUser()?.tier || 'Basic'}</span>
                        </div>
                    </div>
                </div>
            </aside>
        `;
    },

    header: (searchPlaceholder = "Search leads, tasks or contacts...") => {
        const unreadCount = WagoData.activities.filter(a => a.id > WagoData.settings.lastNotificationCheck).length;
        const badgeHtml = unreadCount > 0 ? `
            <span id="notif-badge" class="absolute top-2.5 right-2.5 size-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 shadow-sm animate-pulse"></span>
        ` : '';

        return `
            <header class="h-20 glass-header flex items-center justify-between px-10 shrink-0 z-20">
                <div class="flex-1 max-w-xl">
                    <div class="relative group">
                        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl group-focus-within:text-primary transition-colors">search</span>
                        <input
                            class="w-full pl-12 pr-6 py-3 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-4 focus:ring-primary/10 transition-all"
                            placeholder="${searchPlaceholder}" type="text" />
                    </div>
                </div>

                <div class="flex items-center gap-4 ml-8">
                    <button onclick="openNotifications()" class="size-11 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all relative group">
                        <span class="material-symbols-outlined">notifications</span>
                        ${badgeHtml}
                    </button>
                    <button onclick="openHelp()" class="size-11 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all group">
                        <span class="material-symbols-outlined group-hover:text-primary transition-colors">help</span>
                    </button>
                    <div class="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>
                    <button class="btn-primary" style="padding: 0.65rem 1.25rem; font-size: 0.875rem;" onclick="window.location.href='leads.html?action=new'">
                        <span class="material-symbols-outlined text-xl">add_circle</span>
                        New Lead
                    </button>
                </div>
            </header>
        `;
    },

    modal: () => {
        return `
            <div id="genericModal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-6">
                <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="closeModal()"></div>
                <div class="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden transform transition-all scale-95 opacity-0 duration-300"
                    id="modalContent">
                    <div class="p-10">
                        <div class="flex justify-between items-center mb-6">
                            <h3 id="modalTitle" class="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Modal Title</h3>
                            <button onclick="closeModal()"
                                class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div id="modalBody" class="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                            Modal content will be displayed here.
                        </div>
                        <div class="mt-10 flex justify-end gap-3" id="modalFooter">
                            <button onclick="closeModal()"
                                class="px-6 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-sm">Cancel</button>
                            <button onclick="closeModal()" class="btn-primary"
                                style="padding: 0.75rem 1.5rem; font-size: 0.875rem;">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    init(activePage) {
        // Inject Sidebar
        const mainContainer = document.querySelector('div.flex.h-full');
        const sidebarPlaceholder = document.createElement('div');
        sidebarPlaceholder.innerHTML = this.sidebar(activePage);
        const existingSidebar = document.querySelector('aside');
        if (existingSidebar) {
            existingSidebar.replaceWith(sidebarPlaceholder.firstElementChild);
        } else {
            mainContainer.prepend(sidebarPlaceholder.firstElementChild);
        }

        // Inject Header
        const mainContent = document.querySelector('main');
        const existingHeader = document.querySelector('header');
        const headerHtml = this.header(); // Assuming header doesn't need activePage, or uses a default
        const headerPlaceholder = document.createElement('div');
        headerPlaceholder.innerHTML = headerHtml;
        if (existingHeader) {
            existingHeader.replaceWith(headerPlaceholder.firstElementChild);
        } else if (mainContent) {
            mainContent.prepend(headerPlaceholder.firstElementChild);
        }

        // Inject Modal if not exists
        if (!document.getElementById('genericModal')) {
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = this.modal();
            document.body.appendChild(modalDiv.firstElementChild);
        }

        // Listen for real-time triggers
        window.addEventListener('wago-data-update', (e) => {
            const { title, message, icon, type: toastType } = e.detail;

            // Strict check to prevent "undefined" or null values from appearing
            const hasValidText = title && message &&
                title !== 'undefined' &&
                message !== 'undefined' &&
                String(title).trim() !== '' &&
                String(message).trim() !== '';

            if (hasValidText) {
                this.showToast(title, message, icon, toastType);
            }

            // Force update all notification badges in the UI
            const badges = document.querySelectorAll('.notification-badge');
            badges.forEach(badge => badge.classList.remove('hidden'));
        });
    }
};

function initLayout(type) {
    WagoComponents.init(type);
}

function openWorkflowModal(type) {
    if (type === 'whatsapp') {
        const body = `
            <div class="space-y-6 py-2">
                <div class="flex items-start gap-4 active-step">
                    <div class="flex flex-col items-center">
                        <div class="size-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">1</div>
                        <div class="w-0.5 h-12 bg-slate-100 dark:bg-slate-800 my-1"></div>
                    </div>
                    <div class="pt-1">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">Customer sends message to WhatsApp</p>
                        <p class="text-[11px] text-slate-500">The system will detect any new message from prospects.</p>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="flex flex-col items-center">
                        <div class="size-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold">2</div>
                        <div class="w-0.5 h-12 bg-slate-100 dark:bg-slate-800 my-1"></div>
                    </div>
                    <div class="pt-1">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">System detects new lead</p>
                        <p class="text-[11px] text-slate-500">Confirming prospect is not already in the database.</p>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="flex flex-col items-center">
                        <div class="size-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold ring-4 ring-primary/10 active-step-ring">3</div>
                        <div class="w-0.5 h-20 bg-slate-100 dark:bg-slate-800 my-1"></div>
                    </div>
                    <div class="pt-1 flex-1">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">Send automatic reply message</p>
                        <div class="mt-3">
                            <label class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Reply Message</label>
                            <textarea class="w-full p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs focus:ring-4 focus:ring-primary/10 transition-all resize-none" rows="3">Thank you for contacting us! Please visit wago.my for more information.</textarea>
                        </div>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="flex flex-col items-center">
                        <div class="size-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold">4</div>
                        <div class="w-0.5 h-12 bg-slate-100 dark:bg-slate-800 my-1"></div>
                    </div>
                    <div class="pt-1">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">Save lead into CRM</p>
                        <p class="text-[11px] text-slate-500">Customer data is saved automatically for further action.</p>
                    </div>
                </div>

                <div class="flex items-start gap-4">
                    <div class="size-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">5</div>
                    <div class="pt-1">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">Tag lead based on keywords</p>
                        <p class="text-[11px] text-slate-500">Example: #WhatsAppLead #FacebookAds</p>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button onclick="closeModal()" class="px-6 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-sm">Cancel</button>
            <button onclick="closeModal()" class="btn-primary" style="padding: 0.75rem 1.5rem; font-size: 0.875rem;">Save Workflow</button>
        `;

        openModal('WhatsApp Configuration', body, footer);
    } else if (type === 'notifications') {
        const body = `
            <div class="text-center py-6 space-y-6">
                <div class="size-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-500 mx-auto">
                    <span class="material-symbols-outlined text-4xl">notifications_active</span>
                </div>
                <div>
                    <h4 class="text-lg font-black text-slate-900 dark:text-white mb-2">Enable Desktop Notifications</h4>
                    <p class="text-sm text-slate-500">Don't miss an opportunity! Allow your browser to send notifications directly to your desktop when a new lead comes in.</p>
                </div>
                <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl text-left border border-slate-100 dark:border-slate-800">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined text-primary">check_circle</span>
                        <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Instant new lead alerts</p>
                    </div>
                    <div class="flex items-center gap-3 mt-3">
                        <span class="material-symbols-outlined text-primary">check_circle</span>
                        <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Automatic follow-up reminders</p>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button onclick="closeModal()" class="px-6 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-sm">Not Now</button>
            <button onclick="alert('Notifications enabled!'); closeModal();" class="btn-primary bg-blue-500 text-white hover:bg-blue-600" style="padding: 0.75rem 1.5rem; font-size: 0.875rem;">Enable Now</button>
        `;

        openModal('Desktop Notifications', body, footer);
    } else {
        openModal('Manage Workflow', 'Workflow configuration is loading...');
    }
}

function openModal(title, body, footerHtml) {
    const modal = document.getElementById('genericModal');
    const content = document.getElementById('modalContent');
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerHTML = body;

    if (footerHtml) {
        document.getElementById('modalFooter').innerHTML = footerHtml;
    } else {
        // Default footer
        document.getElementById('modalFooter').innerHTML = `
            <button onclick="closeModal()" class="px-6 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-sm">Cancel</button>
            <button onclick="closeModal()" class="btn-primary" style="padding: 0.75rem 1.5rem; font-size: 0.875rem;">Confirm</button>
        `;
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('genericModal');
    const content = document.getElementById('modalContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function openNotifications() {
    const activities = WagoData.activities.slice(0, 5);
    const body = `
        <div class="space-y-6">
            ${activities.length > 0 ? activities.map(activity => `
                <div class="flex gap-4 group">
                    <div class="size-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        <span class="material-symbols-outlined text-xl">${activity.icon || 'notifications'}</span>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-slate-900 dark:text-white">${activity.name} <span class="font-normal text-slate-500">${activity.action}</span></p>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">${activity.time}</p>
                    </div>
                </div>
            `).join('') : '<p class="text-center py-10 text-slate-400 font-bold">No new notifications.</p>'}
        </div>
    `;

    const footer = `
        <button onclick="closeModal()" class="btn-primary px-8">Close</button>
    `;

    openModal('Recent Notifications', body, footer);

    // Clear badge
    WagoData.settings.lastNotificationCheck = Date.now();
    saveWagoData();
    const badge = document.getElementById('notif-badge');
    if (badge) badge.remove();
}

function openHelp() {
    const body = `
        <div class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
                <button class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl text-left hover:ring-2 hover:ring-primary/50 transition-all group">
                    <span class="material-symbols-outlined text-primary mb-3">book</span>
                    <p class="font-black text-sm text-slate-900 dark:text-white">Documentation</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase mt-1">User Guide</p>
                </button>
                <button class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl text-left opacity-70 cursor-not-allowed group relative overflow-hidden">
                    <span class="material-symbols-outlined text-primary mb-3">video_library</span>
                    <p class="font-black text-sm text-slate-900 dark:text-white">Video Tutorials</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase mt-1">Step by Step</p>
                    <div class="absolute top-2 right-2 bg-primary/10 text-primary text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">Coming Soon</div>
                </button>
            </div>
            <div class="p-8 bg-primary/5 rounded-[2rem] border border-primary/10">
                <div class="flex items-center gap-4 mb-4">
                    <div class="size-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
                        <span class="material-symbols-outlined">support_agent</span>
                    </div>
                    <div>
                        <h4 class="font-black text-slate-900 dark:text-white">Contact Support</h4>
                        <p class="text-xs text-slate-500 font-medium">Technical help & inquiries</p>
                    </div>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-6 font-medium">We are here to help you maximize your use of Zokata. Contact our team through the channels below.</p>
                <div class="space-y-2">
                    <button class="w-full py-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm text-sm font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all">
                        <span class="material-symbols-outlined text-blue-500">mail</span>
                        admin@zokata.eddigitalacademy.com
                    </button>
                </div>
            </div>
        </div>
    `;

    openModal('Help Center', body);
}
