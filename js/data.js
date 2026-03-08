/**
 * js/data.js
 * Manages the application data layer. 
 * Now refactored to use server-side per-user JSON databases via ZokatAuth.
 */

async function saveWagoData(type = 'leads') {
    // We save specific parts to specific endpoints to avoid huge payloads
    // and for better per-user isolation.
    try {
        if (type === 'leads') {
            // Note: Individual lead updates usually happen via PUT /api/leads/:id
            // This global save is a fallback
        } else if (type === 'settings') {
            await ZokatAuth.apiFetch('/api/settings', {
                method: 'PUT',
                body: JSON.stringify(WagoData.settings)
            });
        }
    } catch (err) {
        console.error('Error saving data to server:', err);
    }
}

async function loadAllUserData() {
    if (!ZokatAuth.isLoggedIn()) return;

    try {
        console.log('[Data] Syncing user data from Supabase...');
        const [leadsRes, activitiesRes, settingsRes] = await Promise.all([
            ZokatAuth.apiFetch('/api/leads'),
            ZokatAuth.apiFetch('/api/activities'),
            ZokatAuth.apiFetch('/api/settings')
        ]);

        const leadsData = leadsRes.ok ? await leadsRes.json() : { leads: [] };
        const activitiesData = activitiesRes.ok ? await activitiesRes.json() : [];
        const settingsData = settingsRes.ok ? await settingsRes.json() : {};

        WagoData.leads = leadsData.leads || [];
        WagoData.activities = activitiesData || [];
        WagoData.settings = { ...defaultData.settings, ...(settingsData || {}) };

        // Notify UI that data is ready
        window.dispatchEvent(new CustomEvent('wago-data-update', {
            detail: { type: 'initial_load' }
        }));

        return true;
    } catch (err) {
        console.error('[Data] Failed to load data from server:', err);
        return false;
    }
}

// Initial data load or setup
const defaultData = {
    stats: {
        totalLeads: 1254,
        totalSales: "RM 45,230",
        newLeadsToday: 42,
        leadsTrend: "+12%",
        salesTrend: "+8%",
        newLeadsTrend: "+5%"
    },
    settings: {
        companyName: "Zokata Global",
        email: "admin@zokata.eddigitalacademy.com",
        businessLogo: null,
        whatsappConnected: false,
        whatsappAccount: null,
        lastNotificationCheck: Date.now()
    },
    pipeline: [
        { label: 'Contacted', count: 450, percentage: 100, color: 'bg-primary/30' },
        { label: 'Qualified', count: 210, percentage: 46, color: 'bg-primary/50' },
        { label: 'Proposal', count: 85, percentage: 18, color: 'bg-primary/70' },
        { label: 'Closed', count: 32, percentage: 8, color: 'bg-primary' }
    ],
    tasks: [
        { id: 1, title: 'Follow-up En. Ahmad', description: 'Mengenai sebut harga enterprise', tag: 'Urgent', tagColor: 'text-orange-500 bg-orange-50', time: '10:30 AM', overdue: false },
        { id: 2, title: 'Invoice Cik Siti', description: 'Bayaran deposit fasa 2', tag: 'Finance', tagColor: 'text-blue-500 bg-blue-50', time: '02:00 PM', overdue: false }
    ],
    groups: [], // To store group chat messages/entities
    activities: [
        { id: 1, initial: 'HA', name: 'Hafiz Azman', action: 'New Lead Registered', time: '2m ago', status: 'standard', icon: 'person_add' },
        { id: 2, initial: 'ML', name: 'Mariam Laila', action: 'Pipeline Updated', time: '45m ago', status: 'standard', icon: 'sync' }
    ],
    leads: []
};

// Global data object
let WagoData = JSON.parse(JSON.stringify(defaultData));
// loadAllUserData() should be called by the page after requireAuth()

// Real-time synchronization integration
(function initRealtimeSync() {
    if (typeof io !== 'undefined') {
        const socket = io('http://localhost:3000', {
            reconnectionAttempts: 5,
            timeout: 10000
        });

        socket.on('connect', () => {
            console.log('Real-time sync connected');
        });

        socket.on('new_lead', async (lead) => {
            console.log('New real-time lead received:', lead);

            // EXTRA GUARD: Never add groups to the leads list
            if (lead.phone && lead.phone.includes('@g.us')) {
                console.log('Skipping group ID in lead listener');
                return;
            }

            // In multi-user mode, we don't know which user this lead belongs to 
            // unless the server routes it to the correct socket room.
            // For now, if the user is logged in, we assume context.
            if (!ZokatAuth.isLoggedIn()) return;

            // Avoid duplicates in current view
            const existingIndex = WagoData.leads.findIndex(l => l.phone === lead.phone);
            if (existingIndex === -1) {
                await addNewLead(lead.name, lead.phone, lead.source);
            } else {
                console.log('Lead already exists, marking unread.');
                const existingLead = WagoData.leads[existingIndex];
                existingLead.unread = true;
                if (lead.message) existingLead.lastMessage = lead.message;

                // Update on server
                await ZokatAuth.apiFetch(`/api/leads/${existingLead.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(existingLead)
                });

                await logActivity(lead.name, `New Message: "${lead.message || 'Sent a message'}"`, 'standard', 'chat');
            }
        });

        socket.on('group_message', (data) => {
            console.log('Group message received:', data);

            // Reload to stay in sync
            loadWagoData();

            // Add to groups collection
            WagoData.groups.unshift({
                ...data,
                id: Date.now()
            });

            // Keep only last 50 group messages
            if (WagoData.groups.length > 50) WagoData.groups.pop();

            // Log activity so user can see it in feed, but it won't be a "Lead"
            logActivity(data.name, `Group Message: "${data.message.substring(0, 30)}..."`, 'standard', 'groups');

            saveWagoData();
            // Dispatch update so Leads page can show it if filtered
            window.dispatchEvent(new CustomEvent('wago-data-update', {
                detail: {
                    title: 'New Group Message',
                    message: `${data.name}: ${data.message.substring(0, 20)}...`,
                    icon: 'groups',
                    type: 'info'
                }
            }));
        });

        socket.on('ready', async (data) => {
            console.log('WhatsApp is ready:', data.number);

            // Only show notification if we weren't already connected
            // This prevents duplicate toasts on every page refresh
            const wasConnected = WagoData.settings.whatsappConnected;

            WagoData.settings.whatsappConnected = true;
            WagoData.settings.whatsappAccount = data.number;
            await saveWagoData('settings');

            if (!wasConnected) {
                window.dispatchEvent(new CustomEvent('wago-data-update', {
                    detail: {
                        type: 'connection_status',
                        title: 'WhatsApp Connected',
                        message: `Account ${data.number} is now active.`,
                        icon: 'check_circle',
                        type: 'success'
                    }
                }));
            }
        });

        // Chat Interface socket listeners
        socket.on('chat_history', (data) => {
            window.dispatchEvent(new CustomEvent('whatsapp-chat-history', { detail: data }));
        });

        socket.on('chat_message', (data) => {
            window.dispatchEvent(new CustomEvent('whatsapp-new-message', { detail: data }));
        });

        socket.on('message_sent_success', (data) => {
            window.dispatchEvent(new CustomEvent('whatsapp-send-success', { detail: data }));
        });

        socket.on('chat_error', (data) => {
            window.dispatchEvent(new CustomEvent('whatsapp-chat-error', { detail: data }));
        });

        // Expose global socket helpers
        window.fetchChatHistory = (phone) => socket.emit('get_chat_history', phone);
        window.sendInternalMessage = (phone, message) => socket.emit('send_message', { phone, message });
    }
})();

// Cross-tab synchronization logic removed as server-side sync is now primary.
// initialization happens via async loadAllUserData() in each page.

async function addNewLead(name, phone, source) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const newLead = {
        initial: initials,
        name: name,
        phone: phone,
        status: 'New',
        unread: true,
        source: source,
        date: `Today, ${timeStr}`
    };

    try {
        const res = await ZokatAuth.apiFetch('/api/leads', {
            method: 'POST',
            body: JSON.stringify(newLead)
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        WagoData.leads.unshift(data.lead);
        await logActivity(name, 'New Lead Registered', 'standard', 'person_add');
        return data.lead;
    } catch (err) {
        console.error('Error adding lead:', err);
        window.dispatchEvent(new CustomEvent('wago-error', { detail: err.message }));
        return null;
    }
}

async function logActivity(name, action, status = 'standard', icon = 'notifications') {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const newActivity = {
        initial: initials,
        name: name,
        action: action,
        time: 'Just now',
        status: status,
        icon: icon
    };

    try {
        const res = await ZokatAuth.apiFetch('/api/activities', {
            method: 'POST',
            body: JSON.stringify(newActivity)
        });
        const data = await res.json();
        WagoData.activities.unshift(data.activity);
        if (WagoData.activities.length > 10) WagoData.activities.pop();

        window.dispatchEvent(new CustomEvent('wago-data-update', {
            detail: { title: 'New Activity', message: `${name}: ${action}`, icon: icon, type: 'primary' }
        }));
    } catch (err) {
        console.error('Error logging activity:', err);
    }
}

window.markLeadAsRead = async function (phone) {
    const lead = WagoData.leads.find(l => l.phone === phone);
    if (lead && lead.unread) {
        lead.unread = false;
        try {
            await ZokatAuth.apiFetch(`/api/leads/${lead.id}`, {
                method: 'PUT',
                body: JSON.stringify({ unread: false })
            });

            window.dispatchEvent(new CustomEvent('wago-data-update', {
                detail: { type: 'lead_read', phone: phone }
            }));
        } catch (err) {
            console.error('Error marking lead as read:', err);
        }
    }
}
