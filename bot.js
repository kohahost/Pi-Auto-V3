const StellarSdk = require('stellar-sdk');
const ed25519 = require('ed25519-hd-key');
const bip39 = require('bip39');
const axios = require('axios');
require("dotenv").config();

async function getKeypairFromMnemonic(mnemonic) {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const { key } = ed25519.derivePath("m/44'/314159'/0'", seed.toString('hex'));
    const keypair = StellarSdk.Keypair.fromRawEd25519Seed(key);
    return {
        keypair,
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret()
    };
}

async function startFastBot() {
    const mnemonic = process.env.MNEMONIC;
    const receiver = process.env.RECEIVER_ADDRESS;
    const { keypair, publicKey } = await getKeypairFromMnemonic(mnemonic);
    const server = new StellarSdk.Server('https://api.mainnet.minepi.com');

    while (true) {
        try {
            const account = await server.loadAccount(publicKey);
            const claimables = await server.claimableBalances().claimant(publicKey).call();

            if (claimables.records.length > 0) {
                for (let cb of claimables.records) {
                    const tx = new StellarSdk.TransactionBuilder(account, {
                        fee: (await server.fetchBaseFee()).toString(),
                        networkPassphrase: 'Pi Network'
                    })
                        .addOperation(StellarSdk.Operation.claimClaimableBalance({ balanceId: cb.id }))
                        .setTimeout(30)
                        .build();

                    tx.sign(keypair);
                    const res = await server.submitTransaction(tx);
                    console.log(`✅ Klaim: ${cb.id} — ${res.hash}`);
                }
            }

            const accInfo = await axios.get(`https://api.mainnet.minepi.com/accounts/${publicKey}`);
            const balance = parseFloat(
                accInfo.data.balances.find(b => b.asset_type === 'native')?.balance || "0"
            );

            if (balance > 0.01) {
                const amount = balance - 0.01;
                const reload = await server.loadAccount(publicKey);

                const tx = new StellarSdk.TransactionBuilder(reload, {
                    fee: (await server.fetchBaseFee()).toString(),
                    networkPassphrase: 'Pi Network'
                })
                    .addOperation(StellarSdk.Operation.payment({
                        destination: receiver,
                        asset: StellarSdk.Asset.native(),
                        amount: amount.toFixed(7)
                    }))
                    .setTimeout(30)
                    .build();

                tx.sign(keypair);
                const result = await server.submitTransaction(tx);
                console.log(`📤 Transfer: ${amount.toFixed(7)} Pi — ${result.hash}`);
            } else {
                console.log("⏳ Saldo belum cukup.");
            }

        } catch (err) {
            console.error("❌ Error:", err.response?.data?.extras?.result_codes || err.message);
        }

        // Tidak pakai delay, langsung lanjut
    }
}

// 🕐 Jadwal mulai otomatis (WIB) — ubah waktu di sini
const targetDate = new Date(2025, 6, 8, 1, 58, 0); // YYYY, bulan(0–11), tanggal, jam, menit, detik
const now = new Date();
const delay = targetDate.getTime() - now.getTime();

if (delay <= 0) {
    console.log("⏰ Waktu sudah tercapai. Menjalankan bot...");
    startFastBot();
} else {
    console.log(`⏳ Menunggu sampai ${targetDate.toLocaleString('id-ID')} WIB...`);
    setTimeout(() => {
        console.log("🚀 Waktu tercapai! Menjalankan bot sekarang...");
        startFastBot();
    }, delay);
}
