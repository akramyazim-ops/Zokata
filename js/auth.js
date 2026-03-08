/**
 * Zokata Auth Helper (js/auth.js)
 * Supabase Integration - Handles authentication and profile management.
 */

const ZokatAuth = (() => {
    const SUPABASE_URL = 'https://jpqgpiuckvowwhbgkcsv.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_5c3dreqlIfEH8E9IquRbLA_Iw_Eq3CU';

    let _client = null;
    let _user = null;

    function initClient() {
        if (_client) return _client;
        if (typeof supabase === 'undefined') {
            console.error('Supabase library not loaded. Please include: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
            return null;
        }
        _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return _client;
    }

    async function requireAuth() {
        const client = initClient();
        if (!client) return null;

        const { data: { session }, error } = await client.auth.getSession();

        if (error || !session) {
            console.log('No active session, redirecting to login...');
            window.location.href = 'login.html';
            return null;
        }

        // Fetch user profile from Supabase profiles table
        const { data: profile } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        const userData = {
            id: session.user.id,
            email: session.user.email,
            tier: profile?.tier || 'basic',
            features: profile?.features || {}, // Should be JSON in Supabase
            trial_ends: profile?.trial_ends,
            profile: profile
        };

        _user = userData;
        applyTierGating(userData.features || {});
        return userData;
    }

    function getUser() {
        return _user;
    }

    function isLoggedIn() {
        return !!_user;
    }

    async function logout() {
        const client = initClient();
        if (client) await client.auth.signOut();
        _user = null;
        window.location.href = 'login.html';
    }

    async function apiFetch(endpoint, options = {}) {
        const client = initClient();
        const { data: { session } } = await client.auth.getSession();

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`,
            ...(options.headers || {})
        };

        return fetch(endpoint, { ...options, headers });
    }

    function applyTierGating(features) {
        if (!features) return;

        document.querySelectorAll('[data-tier-require]').forEach(el => {
            const required = el.getAttribute('data-tier-require');
            if (!features[required]) {
                el.style.display = 'none';

                // Add upgrade badge if not present
                if (!el.nextElementSibling || !el.nextElementSibling.classList.contains('upgrade-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'upgrade-badge';
                    badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle">lock</span> Upgrade Required`;
                    badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#1e3526;color:#25d466;border:1px solid #25d46640;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.05em;margin:4px 0;';
                    el.parentNode && el.parentNode.insertBefore(badge, el.nextSibling);
                }
            } else {
                el.style.display = '';
                const existingBadge = el.nextElementSibling;
                if (existingBadge && existingBadge.classList.contains('upgrade-badge')) {
                    existingBadge.remove();
                }
            }
        });

        // Show lead limit warning for Basic tier
        if (features.leadLimit && features.leadLimit !== 'Infinity' && features.leadLimit < Infinity) {
            const limitBanner = document.getElementById('leadLimitBanner');
            if (limitBanner) {
                limitBanner.classList.remove('hidden');
            }
        }
    }

    // Auto-init client if library is ready
    if (typeof supabase !== 'undefined') initClient();

    return {
        getUser,
        isLoggedIn,
        logout,
        requireAuth,
        applyTierGating,
        apiFetch,
        // Helper for login.html
        getClient: initClient
    };
})();
