require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Supabase Admin Client (server‑side only) ──────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTUwMzM2MCwiZXhwIjo0OTI3MTc2OTYwLCJyb2xlIjoiYW5vbiJ9.s0AAg10GbSOn_-7RfJpnJcHNJLCEb6yzkHsKxUhz-tI';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Simple in‑memory cache for platform settings (5 min TTL)
const settingsCache = {};
const CACHE_TTL = 5 * 60 * 1000;

async function getSetting(key) {
    const cached = settingsCache[key];
    if (cached && Date.now() < cached.expiry) return cached.value;

    const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error || !data) return null;
    settingsCache[key] = { value: data.value, expiry: Date.now() + CACHE_TTL };
    return data.value;
}

// Middleware
app.use(cors());
app.use(express.json());

// ─── Health ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'AfriTix Payment & SMTP Relay', version: '2.0.0' });
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── WHATSAPP AI BOT WEBHOOK ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
const WhatsAppAIBot = require('./services/WhatsAppAIBot');

app.post('/api/whatsapp/webhook', async (req, res) => {
    try {
        if (!req.body) return res.status(200).send('OK');

        // Evolution API / WaSender payload mapping (heuristic)
        let phone = req.body.from || (req.body.data && req.body.data.message && req.body.data.message.from);
        let text = req.body.text || req.body.body || (req.body.data && req.body.data.message && req.body.data.message.body);

        // Ignore messages sent by the bot itself
        let isFromMe = req.body.fromMe || (req.body.data && req.body.data.message && req.body.data.message.fromMe);

        if (phone && text && !isFromMe) { 
           console.log(`[WhatsApp Webhook] Message received from ${phone}: ${text}`);
           // Do not await, reply immediately to webhook to avoid timeout
           WhatsAppAIBot.handleIncomingMessage(phone, text).catch(console.error);
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('[WhatsApp Webhook Error]', err);
        res.status(500).send('Error');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── PUBLIC WEB AI CHATBOT ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, pageContext } = req.body;
        if (!messages) return res.status(400).json({ error: 'Messages are required' });

        const aiReply = await WhatsAppAIBot.handleWebChatMessage(messages, pageContext);
        res.status(200).json({ reply: aiReply });
    } catch (err) {
        console.error('[Web Chat Error]', err);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── EMAIL RELAY (existing) ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/send-email', async (req, res) => {
    try {
        const { smtpConfig, to, subject, htmlBody } = req.body;

        if (!smtpConfig || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
            return res.status(400).json({ error: 'Configuration SMTP incomplète' });
        }
        if (!to || !subject || !htmlBody) {
            return res.status(400).json({ error: 'Paramètres email manquants (to, subject, htmlBody)' });
        }

        const transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port || 465,
            secure: smtpConfig.port == 465,
            auth: { user: smtpConfig.user, pass: smtpConfig.pass },
            tls: { rejectUnauthorized: false }
        });

        const info = await transporter.sendMail({
            from: `"${smtpConfig.senderName || 'Babipass'}" <${smtpConfig.user}>`,
            to, subject, html: htmlBody,
        });

        console.log('Email envoyé: %s', info.messageId);
        return res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Erreur email:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── AUTHENTICATION (Password Reset via OTP) ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otp_code, new_password } = req.body;
        if (!email || !otp_code || !new_password) {
            return res.status(400).json({ success: false, error: "Email, OTP et nouveau mot de passe requis." });
        }

        const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SERVICE_ROLE_KEY) {
            return res.status(500).json({ success: false, error: "SUPABASE_SERVICE_ROLE_KEY manquant sur le serveur. Impossible de forcer la mise à jour du mot de passe." });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // 1. Vérifier l'OTP
        const { data: otpData, error: otpError } = await supabaseAdmin
            .from('auth_otps')
            .select('*')
            .eq('email', email)
            .eq('otp_code', otp_code)
            .maybeSingle();

        if (otpError || !otpData) {
            return res.status(400).json({ success: false, error: "Code OTP invalide ou expiré." });
        }

        // 2. Trouver l'utilisateur dans 'profiles'
        const { data: profileData, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (profileError || !profileData) {
            // Tentative 2: si le profile n'existe pas, essayer via listUsers
            const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
            if (usersError) return res.status(500).json({ success: false, error: "Erreur récupération utilisateur." });
            
            const authUser = usersData.users.find(u => u.email === email);
            if (!authUser) return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
            
            // Mettre à jour le mot de passe
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: new_password });
            if (updateError) throw updateError;
        } else {
            // Profile trouvé, on a l'ID
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profileData.id, { password: new_password });
            if (updateError) throw updateError;
        }

        // 3. Nettoyer l'OTP
        await supabaseAdmin.from('auth_otps').delete().eq('email', email);

        return res.status(200).json({ success: true, message: "Mot de passe mis à jour avec succès." });
    } catch (err) {
        console.error('[Reset Password] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── PAYMENT PROXY ENDPOINTS (Keys stay server‑side) ─────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ──── 1. PawaPay ─────────────────────────────────────────────────────────
app.post('/api/pay/pawapay', async (req, res) => {
    try {
        const { phone, amount, network } = req.body;
        if (!phone || !amount) return res.status(400).json({ success: false, error: 'Paramètres manquants (phone, amount)' });

        const config = await getSetting('pawapay_config');
        if (!config || !config.jwtToken) {
            return res.status(500).json({ success: false, error: "Configuration PawaPay manquante. Contactez l'administrateur." });
        }

        const depositId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Format des correspondants PawaPay : https://docs.pawapay.cloud/#tag/deposits
        const payload = {
            depositId: depositId,
            amount: String(amount),
            currency: 'XOF',
            correspondent: network || 'ORANGE_CI',
            payer: {
                type: 'MSISDN',
                address: { value: phone.replace(/\s/g, '') }
            },
            statementDescription: 'AfriTix Ticket'
        };

        console.log(`[PawaPay] Initiating deposit ${depositId} for ${amount} XOF via ${network}`);

        const response = await fetch('https://api.pawapay.cloud/deposits', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.jwtToken}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.depositId) {
            return res.json({
                success: true,
                transactionId: data.depositId,
                status: data.status || 'ACCEPTED',
                message: 'Paiement initié. Veuillez confirmer sur votre téléphone.'
            });
        } else {
            console.error('[PawaPay] Error response:', data);
            return res.json({
                success: false,
                error: data.message || data.errorMessage || 'Erreur PawaPay',
                details: data
            });
        }
    } catch (err) {
        console.error('[PawaPay] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ──── 2. FeexPay ─────────────────────────────────────────────────────────
app.post('/api/pay/feexpay', async (req, res) => {
    try {
        const { phone, amount, network } = req.body;
        if (!phone || !amount) return res.status(400).json({ success: false, error: 'Paramètres manquants (phone, amount)' });

        const config = await getSetting('feexpay_config');
        if (!config || !config.shopId || !config.token) {
            return res.status(500).json({ success: false, error: "Configuration FeexPay manquante. Contactez l'administrateur." });
        }

        // FeexPay API docs: https://docs.feexpay.me
        const payload = {
            shop_id: config.shopId,
            token: config.token,
            amount: amount,
            phone_number: phone.replace(/\s/g, ''),
            network: network || 'MTN',
            currency: 'XOF',
            callback_url: `${SUPABASE_URL}/rest/v1/rpc/noop`,
            description: 'AfriTix Ticket Purchase'
        };

        console.log(`[FeexPay] Initiating ${network} payment for ${amount} XOF to ${phone}`);

        const response = await fetch('https://api.feexpay.me/api/transactions/requesttopay', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && (data.status === 'success' || data.status === 'pending' || data.id)) {
            return res.json({
                success: true,
                transactionId: data.id || data.reference || `FP-${Date.now()}`,
                status: data.status || 'pending',
                message: 'Veuillez valider le paiement sur votre téléphone (USSD envoyé).'
            });
        } else {
            console.error('[FeexPay] Error response:', data);
            return res.json({
                success: false,
                error: data.message || data.error || 'Erreur FeexPay',
                details: data
            });
        }
    } catch (err) {
        console.error('[FeexPay] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ──── 3. InTouch / TouchPay ──────────────────────────────────────────────
app.post('/api/pay/intouch', async (req, res) => {
    try {
        const { phone, amount, provider } = req.body;
        if (!phone || !amount) return res.status(400).json({ success: false, error: 'Paramètres manquants (phone, amount)' });

        const config = await getSetting('intouch_config');
        if (!config || !config.partnerId || !config.login || !config.password) {
            return res.status(500).json({ success: false, error: "Configuration InTouch manquante. Contactez l'administrateur." });
        }

        // InTouch / GTP API
        const payload = {
            idFromClient: `AFTX-${Date.now()}`,
            additionnalInfos: {
                recipientEmail: '',
                recipientFirstName: 'AfriTix',
                recipientLastName: 'Client',
                destinataire: phone.replace(/\s/g, '')
            },
            amount: String(amount),
            callback: `${SUPABASE_URL}/rest/v1/rpc/noop`,
            recipientNumber: phone.replace(/\s/g, ''),
            serviceCode: provider || 'ORANGE_MONEY_CI',
            partner_id: config.partnerId,
            login_api: config.login,
            password_api: config.password
        };

        console.log(`[InTouch] Initiating ${provider} payment for ${amount} XOF to ${phone}`);

        const response = await fetch('https://api.gfrontinch.com/GEP/rest/api/collectMoney', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'login_api': config.login,
                'password_api': config.password
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && (data.status === 'SUCCESSFUL' || data.code === '000' || data.idFromGU)) {
            return res.json({
                success: true,
                transactionId: data.idFromGU || data.idFromClient || `INT-${Date.now()}`,
                status: data.status || 'pending',
                message: `Paiement InTouch initié. Veuillez confirmer sur votre téléphone.`
            });
        } else {
            console.error('[InTouch] Error response:', data);
            return res.json({
                success: false,
                error: data.message || data.errorMessage || "L'API InTouch a rejeté la transaction.",
                details: data
            });
        }
    } catch (err) {
        console.error('[InTouch] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ──── 4. PayDunya ────────────────────────────────────────────────────────
app.post('/api/pay/paydunya', async (req, res) => {
    try {
        const { phone, amount, provider } = req.body;
        if (!phone || !amount) return res.status(400).json({ success: false, error: 'Paramètres manquants (phone, amount)' });

        const config = await getSetting('paydunya_config');
        if (!config || !config.masterKey || !config.privateKey || !config.token) {
            return res.status(500).json({ success: false, error: "Configuration PayDunya manquante. Contactez l'administrateur." });
        }

        // PayDunya Soft Pay / Direct Pay API
        // Docs: https://paydunya.com/developers/documentation
        const payload = {
            invoice: {
                total_amount: amount,
                description: 'AfriTix Ticket Purchase'
            },
            store: {
                name: 'AfriTix',
                phone: phone.replace(/\s/g, '')
            },
            actions: {
                cancel_url: 'https://afritix.com/cancel',
                return_url: 'https://afritix.com/success',
                callback_url: `${SUPABASE_URL}/rest/v1/rpc/noop`
            },
            custom_data: {
                phone_number: phone.replace(/\s/g, ''),
                payment_provider: provider || 'orange-money-senegal'
            }
        };

        console.log(`[PayDunya] Initiating ${provider} payment for ${amount} XOF to ${phone}`);

        // Step 1 : Create Invoice
        const invoiceRes = await fetch('https://app.paydunya.com/api/v1/checkout-invoice/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'PAYDUNYA-MASTER-KEY': config.masterKey,
                'PAYDUNYA-PRIVATE-KEY': config.privateKey,
                'PAYDUNYA-TOKEN': config.token
            },
            body: JSON.stringify(payload)
        });

        const invoiceData = await invoiceRes.json();

        if (invoiceRes.ok && invoiceData.response_code === '00') {
            // Step 2 : Process Soft Pay via the token
            const softPayRes = await fetch('https://app.paydunya.com/api/v1/softpay/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': config.masterKey,
                    'PAYDUNYA-PRIVATE-KEY': config.privateKey,
                    'PAYDUNYA-TOKEN': config.token
                },
                body: JSON.stringify({
                    invoice_token: invoiceData.token,
                    payment_token: provider || 'orange-money-senegal',
                    phone_number: phone.replace(/\s/g, ''),
                    country_code: 'sn'
                })
            });

            const softPayData = await softPayRes.json();

            if (softPayRes.ok && (softPayData.response_code === '00' || softPayData.success)) {
                return res.json({
                    success: true,
                    transactionId: invoiceData.token || `PD-${Date.now()}`,
                    status: 'pending',
                    message: 'Paiement PayDunya initié. Veuillez confirmer sur votre téléphone.'
                });
            } else {
                console.error('[PayDunya] SoftPay error:', softPayData);
                return res.json({
                    success: false,
                    error: softPayData.response_text || 'Erreur SoftPay PayDunya',
                    details: softPayData
                });
            }
        } else {
            console.error('[PayDunya] Invoice creation error:', invoiceData);
            return res.json({
                success: false,
                error: invoiceData.response_text || 'Erreur création facture PayDunya',
                details: invoiceData
            });
        }
    } catch (err) {
        console.error('[PayDunya] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─── DIDIT API CONFIGURATION ────────────────────────────────────────────────
// In a real production environment, these should be loaded from process.env
// We are hardcoding them from the user's secure response for immediate deployment
const DIDIT_API_KEY = 'gkjZnCYzBXgXiWjLNarfXeq8HLCFK0fnzSgulw7NZ9s';
const DIDIT_WORKFLOW_ID = '8fa09204-b88d-442d-ad51-98757f60e0fb';

// ─── DIDIT SESSION CREATION ────────────────────────────────────────────────
app.post('/api/didit/session', express.json(), async (req, res) => {
    try {
        const { user_id, callback_url } = req.body;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id is required' });
        }

        const postData = JSON.stringify({
            workflow_id: DIDIT_WORKFLOW_ID,
            vendor_data: user_id, // THIS IS THE MAGIC! We permanently attach the user ID!
            callback: callback_url || 'https://afritix.com' // Fallback callback
        });

        const options = {
            hostname: 'verification.didit.me',
            path: '/v3/session/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': DIDIT_API_KEY,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const data = await new Promise((resolve, reject) => {
            const reqUrl = require('https').request(options, (resObj) => {
                let responseBody = '';
                resObj.on('data', (chunk) => responseBody += chunk);
                resObj.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseBody);
                        if (resObj.statusCode >= 200 && resObj.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject(new Error(`Didit API error ${resObj.statusCode}: ${responseBody}`));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse Didit response: ${responseBody}`));
                    }
                });
            });

            reqUrl.on('error', (e) => reject(e));
            reqUrl.write(postData);
            reqUrl.end();
        });

        console.log(`[Didit Session] Created session for user ${user_id}: ${data.session_id}`);
        // Return the secure URL to the React frontend
        return res.status(200).json({ success: true, url: data.url, session_id: data.session_id });
    } catch (err) {
        console.error('[Didit Session] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─── DIDIT WEBHOOK ─────────────────────────────────────────────────────────
app.get('/api/webhooks/didit', (req, res) => {
    res.status(200).send('Didit Webhook is active (Ready for POST)');
});

const webhookLogs = [];

app.post('/api/webhooks/didit', async (req, res) => {
    try {
        const body = req.body;
        
        // Log incoming webhook for deep debugging
        const logEntry = {
            timestamp: new Date().toISOString(),
            body: body
        };
        webhookLogs.unshift(logEntry);
        if (webhookLogs.length > 50) webhookLogs.pop(); // Keep last 50
        
        console.log('[Didit Webhook] Received:', body);

        const { decision, vendor_data } = body;
        
        // Handle vendor_data natively
        let user_id = null;
        if (typeof vendor_data === 'string') {
            user_id = vendor_data;
        } else if (vendor_data && vendor_data.user_id) {
            user_id = vendor_data.user_id;
        }

        if (!user_id) {
            console.warn('[Didit Webhook] No user_id found in vendor_data. Ignoring payload as it is not from an API session.');
            return res.status(200).json({ success: true, message: 'Ignored payload without vendor_data' });
        }

        // Check if user_id is a valid UUID to avoid Postgres type errors during Didit UI tests
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id);
        if (!isUUID && user_id) {
            console.log(`[Didit Webhook] Test payload detected (user_id: ${user_id}). Skipping DB update and returning 200 OK.`);
            return res.status(200).json({ success: true, message: 'Test payload accepted' });
        }

        const session_id = body.session_id || decision?.session_id || null;

        // Extract the strict overarching status from the payload
        const topLevelStatus = String(body.status || decision?.status || '').toLowerCase();
        let isApproved = topLevelStatus === 'approved';

        const status = isApproved ? 'verified' : 'rejected';

        // Standard direct robust update (guaranteed to be correct since we rely on vendor_data)
        const { error } = await supabase.rpc('verify_organizer', {
            p_user_id: user_id,
            p_status: status
        });

        if (error) {
            console.error('[Didit Webhook] RPC Error:', error);
            throw error;
        }

        if (session_id) {
            await supabase.from('profiles').update({ didit_session_id: session_id }).eq('id', user_id);
            console.log(`[Didit Webhook] Saved session_id ${session_id} for user ${user_id}`);
        }

        console.log(`[Didit Webhook] User ${user_id} updated to ${status}`);
        return res.status(200).json({ success: true, status, user_id });
    } catch (err) {
        console.error('[Didit Webhook] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Debug Endpoint to view recent webhooks
app.get('/api/webhooks/didit/logs', (req, res) => {
    res.status(200).json(webhookLogs);
});

// ─── Start Server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 AfriTix Server (SMTP + Payment Proxy) running on port ${PORT}`);
});
