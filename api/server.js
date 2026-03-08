require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, '..'), { extensions: ['html'] }));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── BILLPLZ CONFIGURATION ────────────────────────────────────────────────────
const BILLPLZ_X_SIGNATURE_KEY = process.env.BILLPLZ_X_SIGNATURE_KEY || '39913bf6a33774547428cc620ae556896c2f9db074ee3864d8726f028b9a9dd9103c5ebd14c59f8dc03b0d9e138407e5f175f116799ce8bdbd9aacecf614ed1a';
const BILLPLZ_API_KEY = process.env.BILLPLZ_API_KEY || '701d0228-2593-4c57-8819-04501b73d19d';
const BILLPLZ_COLLECTION_ID = process.env.BILLPLZ_COLLECTION_ID || 'rx6h0wfb';
// Set to false for live production, true for sandbox testing
const BILLPLZ_SANDBOX = process.env.BILLPLZ_SANDBOX === 'true' ? true : false;
const BILLPLZ_BASE_URL = BILLPLZ_SANDBOX ? 'https://billplz-staging.herokuapp.com' : 'https://www.billplz.com';
// ─────────────────────────────────────────────────────────────────────────────

// In-memory store for card tokens (for recurring billing)
const subscriberTokens = {}; // { email: { card_id, token, plan, amount } }

// ─── SUPABASE CONFIGURATION ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jpqgpiuckvowwhbgkcsv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_5c3dreqlIfEH8E9IquRbLA_Iw_Eq3CU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tier feature definitions
const TIER_FEATURES = {
    basic: {
        leadLimit: 100,
        salesDashboard: false,
        autoReminder: false,
        advancedPipeline: false,
        advancedAutomation: false,
        apiIntegration: false,
        advancedReporting: false,
        prioritySupport: false,
    },
    growth: {
        leadLimit: Infinity,
        salesDashboard: true,
        autoReminder: true,
        advancedPipeline: true,
        advancedAutomation: false,
        apiIntegration: false,
        advancedReporting: false,
        prioritySupport: false,
    },
    scale: {
        leadLimit: Infinity,
        salesDashboard: true,
        autoReminder: true,
        advancedPipeline: true,
        advancedAutomation: true,
        apiIntegration: true,
        advancedReporting: true,
        prioritySupport: true,
    },
};

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required. Please log in.' });

    try {
        // Verify token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) throw error || new Error('User not found');

        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
            console.error('[Supabase] Profile fetch error:', profileError);
        }

        req.user = { ...user, profile: profile || {} };
        req.tier = TIER_FEATURES[profile?.tier || 'basic'] || TIER_FEATURES.basic;
        next();
    } catch (err) {
        console.error('[Auth] Token verification failed:', err.message);
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────

let client;
let lastQrTime = 0;
let watchdogInterval = null;
let isAuthenticated = false;
let isInitializing = false;

// Silence spammy logs and handle crashes
process.on('uncaughtException', (err) => {
    console.error('--- UNCAUGHT EXCEPTION ---');
    console.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('--- UNHANDLED REJECTION ---');
    console.error(reason);
});

function createWhatsAppClient() {
    if (client) {
        console.log('--- CLEANING UP OLD CLIENT BEFORE CREATING NEW ONE ---');
        // We don't want multiple puppeteer instances
        client.destroy().catch(() => { });
    }

    console.log('--- INITIALIZING WHATSAPP ENGINE ---');

    client = new Client({
        authStrategy: new LocalAuth(),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            ]
        }
    });

    setupClientListeners();
    return client;
}

function setupClientListeners() {
    client.on('qr', (qr) => {
        if (isAuthenticated) return;

        console.log('--- NEW QR CODE GENERATED ---');
        lastQrTime = Date.now();

        // Print small QR to terminal once
        qrcodeTerminal.generate(qr, { small: true });

        qrcode.toDataURL(qr, (err, url) => {
            io.emit('qr', url);
        });
    });

    client.on('ready', () => {
        const name = client.info.pushname || "Primary Account";
        const num = client.info.wid.user;
        console.log(`--- WhatsApp Ready: ${name} (${num}) ---`);

        isAuthenticated = true;
        isInitializing = false;
        stopWatchdog();

        io.emit('ready', { number: num, pushname: name });
    });

    client.on('authenticated', () => {
        console.log('--- Authentication Successful ---');
        isAuthenticated = true;
    });

    client.on('auth_failure', (msg) => {
        console.error('--- Authentication Failed ---', msg);
        isAuthenticated = false;
        isInitializing = false;
        io.emit('auth_failure', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('--- WhatsApp Disconnected ---', reason);
        isAuthenticated = false;
        isInitializing = false;
        io.emit('disconnected', reason);
        // Delay reset to avoid loops
        setTimeout(resetConnection, 5000);
    });

    client.on('message', async (msg) => {
        try {
            // Mute status updates and broadcast spam
            const isSpam = msg.from === 'status@broadcast' || msg.from.includes('broadcast');
            if (isSpam) return;

            // PREVENT GHOST LEADS: Filter notifications/empty system messages
            // msg.type 'chat' is text, other types are media/call/notification
            let content = msg.body;
            const msgType = msg.type || 'unknown';

            if (!content || content.trim() === '') {
                if (msg.hasMedia) {
                    if (msgType === 'image') content = '[Photo]';
                    else if (msgType === 'video') content = '[Video]';
                    else if (msgType === 'sticker') content = '[Sticker]';
                    else if (msgType === 'document') content = '[File/Document]';
                    else if (msgType === 'ptt' || msgType === 'audio') content = '[Voice Message]';
                    else if (msgType === 'location') content = '[Location Shared]';
                    else content = '[Media/File]';
                } else if (msgType === 'vcard' || msgType === 'multi_vcard') {
                    content = '[Contact Shared]';
                } else if (msgType === 'call_log' || msgType === 'cipher') {
                    console.log(`[WA] Ignoring system/call notification from ${msg.from}`);
                    return; // Ignore missed calls/system cryptos as leads
                } else {
                    // Truly empty or unsupported system type
                    console.log(`[WA] Ignoring empty activity of type "${msgType}" from ${msg.from}`);
                    return;
                }
            }

            const isGroup = msg.from.endsWith('@g.us');
            const isLid = msg.from.endsWith('@lid');

            console.log(`[WA] Message from ${msg.from} [${msgType}]: ${content.substring(0, 50)}...`);

            const contact = await msg.getContact();
            const data = {
                id: Date.now(),
                name: contact.pushname || contact.number || "Contact",
                phone: contact.number || msg.from.split('@')[0],
                message: content,
                timestamp: new Date().toISOString(),
                source: isGroup ? 'WhatsApp Group' : 'WhatsApp'
            };

            // Always emit a generic chat_message for the active internal chat window
            // This is used for BOTH individual chats and LIDs
            io.emit('chat_message', {
                phone: data.phone,
                body: data.message,
                fromMe: false,
                timestamp: Math.floor(Date.now() / 1000)
            });

            if (isGroup) {
                io.emit('group_message', data);
            } else {
                // Individual leads (including LIDs)
                // FINAL FILTER: Never emit new_lead for empty results
                if (data.message && data.message.length > 0) {
                    io.emit('new_lead', data);
                }
            }
        } catch (err) {
            console.error('--- CRITICAL ERROR IN MESSAGE HANDLER ---');
            console.error(err);
            // Don't let a single message crash the whole server
        }
    });
}

async function resetConnection() {
    if (isInitializing) {
        console.log('--- Skip Reset: Already Initializing ---');
        return;
    }

    isInitializing = true;
    isAuthenticated = false;

    console.log('--- HARD RESET STARTED ---');

    try {
        if (client) {
            await client.destroy().catch(() => { });
            client = null;
        }
        createClient();
        await client.initialize();
    } catch (e) {
        console.error('Hard Reset Error:', e.message);
        isInitializing = false;
    }
}

function startWatchdog() {
    stopWatchdog();
    console.log('--- Watchdog Active (15s) ---');
    watchdogInterval = setInterval(async () => {
        if (!isAuthenticated && !isInitializing) {
            const now = Date.now();
            // If more than 15s since last QR, and we are not logged in, reset.
            if (now - lastQrTime > 15000) {
                console.log('--- Watchdog Resetting: QR Expired or No Init ---');
                resetConnection();
            }
        }
    }, 15000); // Check every 15s
}

function stopWatchdog() {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
}

io.on('connection', (socket) => {
    if (isAuthenticated && client && client.info) {
        socket.emit('ready', {
            number: client.info.wid.user,
            pushname: client.info.pushname || "Primary Account"
        });
    }

    // New internal chat handlers
    socket.on('get_chat_history', async (phone) => {
        if (!isAuthenticated || !client) return;
        try {
            const formattedPhone = phone.includes('@') ? phone : `${phone.replace(/[^0-9]/g, '')}@c.us`;
            const chat = await client.getChatById(formattedPhone);
            const messages = await chat.fetchMessages({ limit: 50 });

            socket.emit('chat_history', {
                phone: phone,
                messages: messages.map(m => ({
                    body: m.body,
                    fromMe: m.fromMe,
                    timestamp: m.timestamp
                }))
            });
        } catch (err) {
            console.error('Error fetching chat history:', err.message);
            socket.emit('chat_error', { message: 'Failed to load chat history.' });
        }
    });

    socket.on('send_message', async ({ phone, message }) => {
        if (!isAuthenticated || !client) return;
        try {
            const formattedPhone = phone.includes('@') ? phone : `${phone.replace(/[^0-9]/g, '')}@c.us`;
            await client.sendMessage(formattedPhone, message);
            socket.emit('message_sent_success', { phone, message });
        } catch (err) {
            console.error('Error sending message:', err.message);
            socket.emit('chat_error', { message: 'Failed to send message.' });
        }
    });
});

// ─── BILLPLZ WEBHOOK & CALLBACK ROUTES ───────────────────────────────────────

// ─── AUTH ENDPOINTS ──────────────────────────────────────────────────────────

// Sign-up / Payment activation is handled by BillPlz webhook/frontend
// No custom auth endpoints needed on backend as we use Supabase Auth directly on frontend

/** Get current user info (proxied through backend to verify session) */
app.get('/auth/me', requireAuth, (req, res) => {
    return res.json({
        id: req.user.id,
        email: req.user.email,
        tier: req.user.profile?.tier || 'basic',
        trial_ends: req.user.profile?.trial_ends,
        subscription_active: req.user.profile?.subscription_active,
        features: req.tier,
    });
});

// Leads
app.get('/api/leads', requireAuth, async (req, res) => {
    const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ leads, count: leads.length, limit: req.tier.leadLimit });
});

app.post('/api/leads', requireAuth, async (req, res) => {
    // Check limit if on Basic tier
    if (req.tier.leadLimit !== Infinity) {
        const { count } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);

        if (count >= req.tier.leadLimit) {
            return res.status(403).json({ error: `Lead limit reached (${req.tier.leadLimit} max for your plan).` });
        }
    }

    const { data: lead, error } = await supabase
        .from('leads')
        .insert({ ...req.body, user_id: req.user.id })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ lead });
});

app.put('/api/leads/:id', requireAuth, async (req, res) => {
    const { data: lead, error } = await supabase
        .from('leads')
        .update(req.body)
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select()
        .single();

    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    return res.json({ lead });
});

app.delete('/api/leads/:id', requireAuth, async (req, res) => {
    const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
});

// Activities
app.get('/api/activities', requireAuth, async (req, res) => {
    const { data: activities, error } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) return res.status(500).json({ error: error.message });
    return res.json(activities);
});

app.post('/api/activities', requireAuth, async (req, res) => {
    const { data: activity, error } = await supabase
        .from('activities')
        .insert({ ...req.body, user_id: req.user.id })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ activity });
});

// Settings
app.get('/api/settings', requireAuth, async (req, res) => {
    const { data: settings, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    return res.json(settings?.data || {});
});

app.put('/api/settings', requireAuth, async (req, res) => {
    const { data: existing } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

    const updatedData = { ...(existing?.data || {}), ...req.body };
    const { error } = await supabase
        .from('settings')
        .upsert({ user_id: req.user.id, data: updatedData }, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settings: updatedData });
});

// Tier feature check
app.get('/api/tier', requireAuth, (req, res) => {
    return res.json({ tier: req.user.profile?.tier || 'basic', features: req.tier });
});

// ─────────────────────────────────────────────────────────────────────────────

// Pending bills map: track email+plan for each bill so we can activate user on payment
const pendingBills = {}; // { billId: { email, plan } }

/**
 * Create a BillPlz Bill (POST)
 * Called by checkout.html to initiate a payment. Returns the BillPlz payment URL.
 */
app.post('/billplz/create-bill', async (req, res) => {
    const { email, name, plan, amount } = req.body;
    if (!email || !plan || !amount) {
        return res.status(400).json({ error: 'Missing required fields: email, plan, amount' });
    }

    const https = require('https');
    const BASE_URL = req.protocol + '://' + req.get('host');
    const billData = new URLSearchParams({
        collection_id: BILLPLZ_COLLECTION_ID,
        email: email,
        name: name || email,
        amount: String(Math.round(parseFloat(amount) * 100)), // BillPlz uses cents
        description: `Zokata ${plan} Plan - 1 Week Free Trial`,
        callback_url: `${BASE_URL}/billplz/webhook`,
        redirect_url: `${BASE_URL}/billplz/callback`,
        // Tag as subscription for recurring billing tracking
        reference_1_label: 'Subscription Plan',
        reference_1: plan,
    });

    try {
        console.log(`[BillPlz] Using ${BILLPLZ_SANDBOX ? 'SANDBOX' : 'PRODUCTION'} — ${BILLPLZ_BASE_URL}`);
        const response = await fetch(`${BILLPLZ_BASE_URL}/api/v3/bills`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(BILLPLZ_API_KEY + ':').toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: billData.toString(),
        });

        // Safely parse response — BillPlz may return HTML on auth/collection errors
        const rawText = await response.text();
        let bill;
        try {
            bill = JSON.parse(rawText);
        } catch (_) {
            console.error('[BillPlz] Non-JSON response:', rawText.substring(0, 300));
            const friendlyMsg = rawText.includes('RecordNotFound')
                ? 'Collection ID not found. Please check your BillPlz Collection ID.'
                : rawText.includes('Unauthorized') || rawText.includes('401')
                    ? 'BillPlz API Key is invalid or unauthorized.'
                    : 'Unexpected response from BillPlz. Check your Collection ID and API Key.';
            return res.status(500).json({ error: friendlyMsg });
        }

        if (!response.ok || !bill.url) {
            console.error('[BillPlz] Bill creation failed:', JSON.stringify(bill));
            // BillPlz error.message can be a string or an array
            let errMsg = 'Failed to create bill.';
            if (bill.error) {
                const m = bill.error.message;
                errMsg = Array.isArray(m) ? m.join(', ') : (m || bill.error.type || JSON.stringify(bill.error));
            } else if (bill.errors) {
                errMsg = Array.isArray(bill.errors) ? bill.errors.join(', ') : JSON.stringify(bill.errors);
            }
            return res.status(500).json({ error: errMsg });
        }

        console.log(`[BillPlz] Bill created: ${bill.id} for ${email} (${plan} - RM${amount})`);
        // Track email+plan for this bill so we can activate user when paid
        pendingBills[bill.id] = { email, plan: plan.toLowerCase().split(' ')[0] };
        return res.json({ url: bill.url, bill_id: bill.id });
    } catch (err) {
        console.error('[BillPlz] Error creating bill:', err.message);
        return res.status(500).json({ error: 'Server error while creating bill: ' + err.message });
    }
});

/**
 * BillPlz Redirect Callback (GET)
 * BillPlz redirects the user here after payment (success or failure).
 * URL set in BillPlz Dashboard as "Redirect URL" → http://yourdomain.com/billplz/callback
 */
app.get('/billplz/callback', (req, res) => {
    const { billplz } = req.query;
    if (!billplz) {
        return res.redirect('/payment-result?status=error&reason=invalid_callback');
    }

    const billId = billplz['id'];
    const paid = billplz['paid'] === 'true';
    const paidAt = billplz['paid_at'] || '';
    const xSignature = billplz['x_signature'] || '';

    // Verify X-Signature (HMAC-SHA256 of sorted key-value pairs)
    const params = { 'billplz[id]': billId, 'billplz[paid]': String(paid), 'billplz[paid_at]': paidAt };
    const sourceStr = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('|');
    const expectedSig = crypto.createHmac('sha256', BILLPLZ_X_SIGNATURE_KEY).update(sourceStr).digest('hex');

    if (xSignature !== expectedSig) {
        console.error('[BillPlz] CALLBACK: Invalid X-Signature! Possible tampering.');
        return res.redirect('/payment-result?status=error&reason=invalid_signature');
    }

    if (paid) {
        console.log(`[BillPlz] CALLBACK: Bill ${billId} PAID at ${paidAt}`);
        const pending = pendingBills[billId];
        const emailParam = pending ? `&email=${encodeURIComponent(pending.email)}&plan=${pending.plan}` : '';
        return res.redirect(`/payment-result?status=success&bill_id=${billId}${emailParam}`);
    } else {
        console.log(`[BillPlz] CALLBACK: Bill ${billId} NOT PAID (user returned without paying)`);
        return res.redirect(`/payment-result?status=cancelled&bill_id=${billId}`);
    }
});

/**
 * BillPlz Webhook / Notification URL (POST)
 * BillPlz calls this server-to-server when payment status changes.
 * URL set in BillPlz Dashboard as "Callback URL" → http://yourdomain.com/billplz/webhook
 */
app.post('/billplz/webhook', async (req, res) => {
    const { 'billplz[id]': billId, 'billplz[paid]': paid, 'billplz[paid_at]': paidAt, 'billplz[x_signature]': xSignature } = req.body;
    // BillPlz card payment fields (sent when customer pays by card)
    const cardId = req.body['billplz[card][id]'] || req.body.card_id || null;
    const cardToken = req.body['billplz[card][token]'] || req.body.token || null;
    const cardEmail = req.body.email || null;

    if (!billId) {
        console.error('[BillPlz] WEBHOOK: Missing bill ID in payload.');
        return res.status(400).json({ error: 'Missing bill ID' });
    }

    // Verify X-Signature
    const params2 = { 'billplz[id]': billId, 'billplz[paid]': String(paid), 'billplz[paid_at]': paidAt || '' };
    const sourceStr2 = Object.keys(params2).sort().map(k => `${k}${params2[k]}`).join('|');
    const expectedSig2 = crypto.createHmac('sha256', BILLPLZ_X_SIGNATURE_KEY).update(sourceStr2).digest('hex');

    if (xSignature !== expectedSig2) {
        console.error(`[BillPlz] WEBHOOK: Invalid X-Signature for bill ${billId}! Rejecting.`);
        return res.status(400).json({ error: 'Invalid signature' });
    }

    if (paid === 'true') {
        console.log(`[BillPlz] WEBHOOK: ✅ Bill ${billId} confirmed PAID at ${paidAt}`);
        // Auto-activate user account based on pending bill record
        const pending = pendingBills[billId];
        if (pending) {
            const users = readUsers();
            const now = new Date();
            const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const validTier = ['basic', 'growth', 'scale'].includes(pending.plan) ? pending.plan : 'basic';
            if (users[pending.email]) {
                users[pending.email].tier = validTier;
                users[pending.email].subscription_active = true;
                users[pending.email].trial_ends = trialEnds.toISOString();
                users[pending.email].updated_at = now.toISOString();
            } else {
                users[pending.email] = {
                    id: crypto.randomBytes(8).toString('hex'),
                    tier: validTier,
                    subscription_active: true,
                    trial_ends: trialEnds.toISOString(),
                    created_at: now.toISOString(),
                    updated_at: now.toISOString(),
                };
            }
            writeUsers(users);
            console.log(`[Auth] WEBHOOK: Auto-activated ${pending.email} as ${validTier}`);
            delete pendingBills[billId];
        }
        // Save card token if customer paid by card (enables recurring charges)
        if (cardId && cardToken && cardEmail) {
            subscriberTokens[cardEmail] = {
                card_id: cardId,
                token: cardToken,
                bill_id: billId,
                saved_at: paidAt,
            };
            console.log(`[BillPlz] WEBHOOK: 💳 Card token saved for ${cardEmail} (card_id: ${cardId})`);
        }
        // Update your database, grant user access
        console.log(`[BillPlz] Activating subscription for ${cardEmail || 'user'} (Tier: ${plan || 'basic'})`);

        // Find user by email in Supabase to get their ID
        const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(cardEmail);

        if (userData && userData.user) {
            const userId = userData.user.id;
            const now = new Date();
            const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: userId,
                    tier: plan || 'basic',
                    subscription_active: true,
                    trial_ends: trialEnds.toISOString(),
                    updated_at: now.toISOString(),
                    features: TIER_FEATURES[plan || 'basic']
                });

            if (profileError) console.error('[Supabase] Webhook profile update error:', profileError);
            else console.log(`[Supabase] Success: Activated ${plan} for ${cardEmail}`);
        } else {
            console.warn(`[Supabase] Webhook: User ${cardEmail} not found in Auth. They might need to sign up first.`);
        }

        io.emit('payment_success', { billId, paidAt, email: cardEmail });
    } else {
        console.log(`[BillPlz] WEBHOOK: ❌ Bill ${billId} marked UNPAID/FAILED.`);
        io.emit('payment_failed', { billId });
    }

    return res.status(200).json({ received: true });
});

/**
 * BillPlz Charge Card (POST) — Recurring Payments
 * Use a stored card token to charge a subscriber without them re-entering card details.
 * The CARD_ID and TOKEN are captured from the webhook after the first card payment.
 * BillPlz API: POST /api/v3/charge
 */
app.post('/billplz/charge-card', async (req, res) => {
    const { email, plan, amount } = req.body;
    if (!email || !amount) {
        return res.status(400).json({ error: 'Missing required fields: email, amount' });
    }

    const sub = subscriberTokens[email];
    if (!sub) {
        return res.status(404).json({ error: `No saved card token found for ${email}. Customer must pay via card first.` });
    }

    const BASE_URL = req.protocol + '://' + req.get('host');
    const chargeData = new URLSearchParams({
        collection_id: BILLPLZ_COLLECTION_ID,
        email: email,
        name: email,
        amount: String(Math.round(parseFloat(amount) * 100)),
        description: `Zokata ${plan || 'Subscription'} - Monthly Renewal`,
        callback_url: `${BASE_URL}/billplz/webhook`,
        redirect_url: `${BASE_URL}/billplz/callback`,
        card_id: sub.card_id,
        token: sub.token,
        reference_1_label: 'Recurring',
        reference_1: plan || 'monthly',
    });

    try {
        console.log(`[BillPlz] Charging saved card for ${email} (card_id: ${sub.card_id})`);
        const response = await fetch(`${BILLPLZ_BASE_URL}/api/v3/charge`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(BILLPLZ_API_KEY + ':').toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: chargeData.toString(),
        });

        const rawText = await response.text();
        let result;
        try { result = JSON.parse(rawText); } catch (_) {
            console.error('[BillPlz] Charge non-JSON response:', rawText.substring(0, 200));
            return res.status(500).json({ error: 'Unexpected response from BillPlz charge.' });
        }

        if (!response.ok) {
            console.error('[BillPlz] Charge failed:', JSON.stringify(result));
            const m = result.error?.message;
            return res.status(500).json({ error: Array.isArray(m) ? m.join(', ') : (m || 'Charge failed') });
        }

        console.log(`[BillPlz] ✅ Recurring charge succeeded for ${email}: bill ${result.id}`);
        return res.json({ success: true, bill_id: result.id, url: result.url });

    } catch (err) {
        console.error('[BillPlz] Charge error:', err.message);
        return res.status(500).json({ error: 'Server error during card charge: ' + err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Zokata Backend: http://localhost:${PORT}`);
    createWhatsAppClient();
    client.initialize().then(() => {
        startWatchdog();
    }).catch(err => {
        console.error('Bootstrap Error:', err.message);
        startWatchdog();
    });
});
