// Injiziert die Android-Härtung idempotent in das (regenerierbare) android/-Projekt.
// Läuft in build-apk.sh nach `npx cap sync` — überlebt damit auch ein frisches `npx cap add android`.
//   Alien Notes (aus Alien Pass v1.8 übernommen; neu: SecureScreenPlugin für den FLAG_SECURE-Schalter).
//   1) AndroidManifest: allowBackup=false (keine ADB-/Cloud-Backups der Tresor-Daten)
//   2) AndroidManifest: INTERNET-Permission ENTFERNEN (App kann nachweisbar nicht funken)
//   3) MainActivity: FLAG_SECURE (kein Screenshot/Recording, keine Recents-Vorschau) + WebView vom Android-Autofill-Framework
//      ausgenommen (v1.4, aus Alien Pass v1.12: fremde Autofill-Dienste wie ein Passwort-Manager sehen die Passphrase-Felder sonst und
//      bieten an, sie zu speichern; autocomplete="off" im HTML hält das nicht auf). Wirksam ist erst getSystemService("autofill") → null
//      (Chromium fragt das View-Flag nicht ab; Gerätetest Alien Pass 26.09.2026), das Flag bleibt als zweite Schicht. Seit v1.5 (aus Alien Pass
//      v1.15) entfernt dropAutofillRestore() die Restore-Extras aus jedem Intent — sonst NullPointerException in Activity.restoreAutofillSaveUi().
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(MANIFEST, 'utf8');
const before = m;
m = m.replace(/android:allowBackup="true"/g, 'android:allowBackup="false"');
m = m.replace(/^\s*<uses-permission android:name="android\.permission\.INTERNET"\s*\/>\s*$/gm, '');
// 1b) Backup-Regeln: allowBackup=false greift seit targetSdk 31 NICHT mehr für Gerät-zu-Gerät-Transfer/Seedvault
//     (IGNORE_ALLOW_BACKUP_IN_D2D) — ohne dataExtractionRules würde app_webview (localStorage-Tresor) mitkopiert.
const XML_DIR = 'android/app/src/main/res/xml';
const RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- Alien Notes: nichts sichern — weder Cloud-Backup noch Geraet-zu-Geraet-Transfer (auch nicht verschluesselt). -->
<data-extraction-rules>
    <cloud-backup disableIfNoEncryptionCapabilities="true">
        <exclude domain="root"/><exclude domain="file"/><exclude domain="database"/><exclude domain="sharedpref"/><exclude domain="external"/>
    </cloud-backup>
    <device-transfer>
        <exclude domain="root"/><exclude domain="file"/><exclude domain="database"/><exclude domain="sharedpref"/><exclude domain="external"/>
    </device-transfer>
</data-extraction-rules>
`;
if (!existsSync(XML_DIR)) mkdirSync(XML_DIR, { recursive: true });
writeFileSync(XML_DIR + '/data_extraction_rules.xml', RULES);
if (!/android:dataExtractionRules=/.test(m)) m = m.replace(/<application\b/, '<application android:dataExtractionRules="@xml/data_extraction_rules"');
// 1c) Einzige erlaubte Berechtigung: USE_BIOMETRIC (Fingerabdruck-Entsperren, v1.2) — normale Permission, kein Netz, kein Dateizugriff.
//     build-apk.sh prüft an der fertigen APK, dass NUR USE_BIOMETRIC (+ das von androidx.biometric gemergte USE_FINGERPRINT für API < 28) vorkommt.
if (!/android\.permission\.USE_BIOMETRIC/.test(m)) m = m.replace(/<\/manifest>\s*$/, '    <uses-permission android:name="android.permission.USE_BIOMETRIC" />\n</manifest>\n');
// USE_FINGERPRINT bringt androidx.biometric ohne maxSdkVersion mit; wir ersetzen es per tools:node="replace" durch die Variante bis API 27
// (nur dort nutzt die Bibliothek FingerprintManager) — so trägt die APK auf aktuellen Androids nur USE_BIOMETRIC (Audit run-3 #7).
if (!/xmlns:tools=/.test(m)) m = m.replace(/<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"');
if (!/android\.permission\.USE_FINGERPRINT/.test(m)) m = m.replace(/<\/manifest>\s*$/, '    <uses-permission android:name="android.permission.USE_FINGERPRINT" android:maxSdkVersion="27" tools:node="replace" />\n</manifest>\n');
if (m !== before) writeFileSync(MANIFEST, m);
// Invarianten IMMER prüfen (nicht nur im No-op-Zweig) — sonst könnte ein gedriftetes Template
// still un-gehärtet durchrutschen: fehlt allowBackup ganz, defaultet Android auf true.
if (!/android:allowBackup="false"/.test(m) || /android\.permission\.INTERNET/.test(m) || !/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(m) || !existsSync(XML_DIR + '/data_extraction_rules.xml') || !/android\.permission\.USE_BIOMETRIC/.test(m)) {
  console.error('FEHLER: Manifest-Härtung unvollständig (allowBackup!=false, INTERNET vorhanden, dataExtractionRules oder USE_BIOMETRIC fehlen) — Build abgebrochen!');
  process.exit(1);
}
// v1.15 (Release-Audit Runde 2 Prüfer b B1): die Datensicherungs-Regeln (Invariante „nichts sichern“) WÖRTLICH als unabhängige Zweitkopie gegen die
// GESCHRIEBENE Datei — vorher prüfte keine Schicht den Inhalt (build-apk.sh: Existenz und ≥ 2 root-Zeilen), ein <include domain="root"/> statt <exclude>
// bestand beide (Prüfer-Mutant rules-include). Kein <include, je fünf exclude in cloud-backup UND device-transfer. Am Bytecode: die APK-Ressource per sha256
// (PIN_EINTRAEGE in build-apk.sh).
const RULES_PIN = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Alien Notes: nichts sichern — weder Cloud-Backup noch Geraet-zu-Geraet-Transfer (auch nicht verschluesselt). -->\n<data-extraction-rules>\n    <cloud-backup disableIfNoEncryptionCapabilities=\"true\">\n        <exclude domain=\"root\"/><exclude domain=\"file\"/><exclude domain=\"database\"/><exclude domain=\"sharedpref\"/><exclude domain=\"external\"/>\n    </cloud-backup>\n    <device-transfer>\n        <exclude domain=\"root\"/><exclude domain=\"file\"/><exclude domain=\"database\"/><exclude domain=\"sharedpref\"/><exclude domain=\"external\"/>\n    </device-transfer>\n</data-extraction-rules>\n";
{ const r = readFileSync(XML_DIR + '/data_extraction_rules.xml', 'utf8');
  if (r !== RULES_PIN || /<include\b/i.test(r) || (r.match(/<exclude domain="(root|file|database|sharedpref|external)"\/>/g) || []).length !== 10) {
    console.error('FEHLER: Datensicherungs-Regeln ≠ Zweitkopie (nur exclude, je fünf Bereiche in cloud-backup und device-transfer) — Build abgebrochen!'); process.exit(1); } }
console.log(m !== before ? 'Manifest gehärtet (allowBackup=false, INTERNET entfernt, dataExtractionRules gesetzt, USE_BIOMETRIC).' : 'Manifest bereits gehärtet.');

// 2) Gradle: androidx.biometric für BiometricPrompt (System-Dialog + Keystore-Bindung). Einzige zusätzliche Abhängigkeit, idempotent.
const GRADLE = 'android/app/build.gradle';
const BIO_DEP = '    implementation "androidx.biometric:biometric:1.1.0"   // Alien Notes: Fingerabdruck-Entsperren (patch-hardening.mjs)\n';
let g = readFileSync(GRADLE, 'utf8');
if (!g.includes('androidx.biometric:biometric')) { g = g.replace(/^dependencies \{\n/m, 'dependencies {\n' + BIO_DEP); writeFileSync(GRADLE, g); console.log('build.gradle: androidx.biometric ergänzt.'); }
if (!readFileSync(GRADLE, 'utf8').includes('androidx.biometric:biometric:1.1.0')) { console.error('FEHLER: androidx.biometric fehlt in build.gradle — Build abgebrochen!'); process.exit(1); }

//   4) SecureClip-Plugin: Zwischenablage nativ schreiben/leeren, Inhalt als „sensibel“ markiert (keine System-Vorschau, API 33+)
const JAVA_DIR = 'android/app/src/main/java/org/alieninvestor/notes';
const MAIN = JAVA_DIR + '/MainActivity.java';
const MAIN_SRC = `package org.alieninvestor.notes;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Gegenstück zum Hebel unten (v1.5, aus Alien Pass v1.15): Activity.restoreAutofillSaveUi() ruft getAutofillManager() OHNE Null-Prüfung,
    // ausgelöst allein durch diese Intent-Extras (finish/onBackPressed/onStop/startActivity, Android 8.1+). Jede App könnte Alien Notes mit ihnen starten und
    // beim Schließen abstürzen lassen (NullPointerException, ggf. mitten im Speichern) — deshalb vor super.onCreate/onNewIntent entfernen.
    private static void dropAutofillRestore(Intent i) {
        if (i == null) return;
        i.removeExtra("android.view.autofill.extra.RESTORE_SESSION_TOKEN");
        i.removeExtra("android.view.autofill.extra.RESTORE_CROSS_ACTIVITY");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        dropAutofillRestore(intent);
        super.onNewIntent(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        dropAutofillRestore(getIntent());
        registerPlugin(SecureClipPlugin.class);
        registerPlugin(BiometricPlugin.class);
        registerPlugin(SecureScreenPlugin.class);
        registerPlugin(VaultStorePlugin.class);
        super.onCreate(savedInstanceState);
        // Kein Screenshot/Screen-Recording, keine Vorschau im App-Switcher (Recents) — ab Werk und auf dem Sperrbildschirm IMMER;
        // eine entsperrte Sitzung darf die Flagge über SecureScreenPlugin.set(false) aufheben (Einstellung, Entscheidung 24.09.2026)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        // Kein Android-Autofill (API 26+): Die WebView meldet sonst jedes Passwortfeld an den systemweiten Autofill-Dienst — eine
        // fremde App, die den Inhalt zum Speichern anbieten könnte. autocomplete="off" im HTML hält das nicht auf. Die App hat
        // bewusst keinen eigenen Autofill-Dienst, darum braucht sie das Framework auch nicht.
        if (Build.VERSION.SDK_INT >= 26) {
            View webView = getBridge().getWebView();
            webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }
    }

    // Wirksame Schicht (Gerätetest Alien Pass v1.12/v1.13, GrapheneOS 26.09.2026): das Flag oben prüft Chromiums WebView-AutofillProvider
    // nicht, und notifyViewEntered für virtuelle Views fragt isImportantForAutofill nicht ab — Proton Pass bot sich weiter an. Chromiums
    // AutofillManagerWrapper holt den Manager per context.getSystemService(AutofillManager.class) über den WebView-Context (= diese
    // Activity); liefert der null, ist isDisabled() true und alle notify*-Aufrufe sind No-ops. Context.AUTOFILL_MANAGER_SERVICE ist nicht
    // öffentlich, darum das Literal "autofill" (API 26+).
    @Override
    public Object getSystemService(String name) {
        if ("autofill".equals(name)) return null;   // Dienstname des AutofillManager (API 26+, Konstante ist nicht öffentlich)
        return super.getSystemService(name);
    }
}
`;
const CLIP = JAVA_DIR + '/SecureClipPlugin.java';
const CLIP_SRC = `package org.alieninvestor.notes;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Build;
import android.os.PersistableBundle;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Zwischenablage ohne System-Vorschau: EXTRA_IS_SENSITIVE (Android 13+) maskiert den Inhalt im Clipboard-Overlay.
 *  Kein Lesen der Zwischenablage, keine weiteren Berechtigungen. */
@CapacitorPlugin(name = "SecureClip")
public class SecureClipPlugin extends Plugin {
    private ClipboardManager cm() { return (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE); }

    @PluginMethod
    public void write(PluginCall call) {
        String text = call.getString("text", "");
        try {
            ClipData clip = ClipData.newPlainText("", text);
            if (Build.VERSION.SDK_INT >= 33) {
                PersistableBundle extras = new PersistableBundle();
                extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true);
                clip.getDescription().setExtras(extras);
            }
            cm().setPrimaryClip(clip);
            call.resolve();
        } catch (Exception e) { call.reject("clip"); }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 28) cm().clearPrimaryClip();
            else cm().setPrimaryClip(ClipData.newPlainText("", " "));
            call.resolve();
        } catch (Exception e) { call.reject("clip"); }
    }
}
`;
//   5) Biometric-Plugin (v1.2): verwahrt 32 Byte Zufall aus dem JS im Android-Keystore, freigegeben nur nach starker Biometrie mit Bestätigung
//      (Android kennt keine „nur Fingerabdruck“-Bindung; ein Fingerabdrucksensor wird vorausgesetzt). Der Keystore-Schlüssel ist pro Nutzung
//      gebunden, wird bei neuem Fingerabdruck ungültig und liegt in der StrongBox, wenn vorhanden. Nach einem Neustart (Boot-Kennung, als AAD
//      mitauthentisiert) meldet status() „reboot“ und löscht Datei + Schlüssel → Passphrase-Pflicht (Regel im Code, keine Krypto-Garantie).
const BIO = JAVA_DIR + '/BiometricPlugin.java';
const BIO_SRC = `package org.alieninvestor.notes;

import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Fingerabdruck-Slot: 32 Byte Zufall (vom JS erzeugt, dort als Wrap-Schlüssel für den DEK benutzt) liegen AES-GCM-verschlüsselt
 *  unter einem Android-Keystore-Schlüssel, der nur nach einem starken Fingerabdruck nutzbar ist (Freigabe pro Nutzung, ungültig bei
 *  neu eingerichtetem Fingerabdruck, StrongBox falls vorhanden; Bestätigung im Prompt verlangt, Fingerabdrucksensor vorausgesetzt).
 *  Die Boot-Kennung ist als GCM-AAD mitauthentisiert; nach einem Neustart meldet status() "reboot" und löscht Datei + Schlüssel.
 *  Ausnahme seit v1.8: Wurde der Slot mit keep=true angelegt (Kästchen beim Aktivieren, ab Werk aus), gilt er über den Neustart hinaus;
 *  dann lautet die AAD boot+"|keep" statt boot — die Wahl ist damit mitauthentisiert und nur durch Neu-Aktivieren änderbar.
 *  Liest keine fremden Daten, braucht nur USE_BIOMETRIC (+ USE_FINGERPRINT bis API 27).
 *  Fehlercodes an JS: cancel | lockout | reboot | invalidated | tampered | none | unavailable | error. */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {
    private static final String ALIAS = "alien-notes-bio";
    /** Kanarien-Schlüssel (Tresor-Audit run-5 #1, identisch hier): gleiche Flags wie der Slot-Schlüssel, wird NIE benutzt und beim Neustart
     *  NICHT gelöscht. Er entsteht nur beim bewussten Aktivieren und wird ungültig, sobald ein Fingerabdruck neu registriert wird — so bleibt
     *  der Nachweis einer neuen Registrierung über den Neustart erhalten, obwohl der Slot selbst dort gelöscht wird. */
    private static final String CANARY = "alien-notes-bio-canary";
    private static final String FILE = "alien-notes-bio.json";
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private File file() { return new File(getContext().getFilesDir(), FILE); }

    /** Boot-Kennung, immer in der GCM-AAD des Slots (Audit run-8 #4): zuerst Settings.Global.BOOT_COUNT (API 24+, keine Berechtigung,
     *  monoton, unabhängig von /proc und von der Uhr) als "b:<n>", ersatzweise /proc boot_id ("id:"), zuletzt die Boot-Zeit in Sekunden
     *  ("t:", Toleranz beim Vergleich). Slots von v1.7 tragen "id:"/"t:" und melden nach dem Update einmal reboot → Neu-Bewaffnung nach der Passphrase. */
    private String bootTag() {
        try { int n = Settings.Global.getInt(getContext().getContentResolver(), Settings.Global.BOOT_COUNT); if (n > 0) return "b:" + n; } catch (Exception ignored) {}
        try (BufferedReader r = new BufferedReader(new FileReader("/proc/sys/kernel/random/boot_id"))) {
            String s = r.readLine();
            if (s != null && s.trim().length() >= 8) return "id:" + s.trim();
        } catch (Exception ignored) {}
        return "t:" + ((System.currentTimeMillis() - SystemClock.elapsedRealtime()) / 1000L);
    }
    private boolean sameBoot(String stored) {
        if (stored == null || stored.length() < 3) return false;
        String now = bootTag();
        if (!stored.startsWith("t:") || !now.startsWith("t:")) return stored.equals(now);
        try { return Math.abs(Long.parseLong(stored.substring(2)) - Long.parseLong(now.substring(2))) <= 120; }
        catch (Exception e) { return false; }
    }

    private JSONObject readState() {
        File f = file();
        if (!f.exists()) return null;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder(); String line;
            while ((line = r.readLine()) != null) sb.append(line);
            JSONObject o = new JSONObject(sb.toString());
            if (!o.has("iv") || !o.has("ct") || !o.has("boot")) return null;
            return o;
        } catch (Exception e) { return null; }
    }
    private void writeState(JSONObject o) throws Exception {
        try (FileOutputStream out = new FileOutputStream(file())) { out.write(o.toString().getBytes(StandardCharsets.UTF_8)); }
    }
    private void wipe() {
        try { file().delete(); } catch (Exception ignored) {}
        deleteKey(ALIAS);
    }
    /** Slot UND Kanarie verwerfen: bewusstes Deaktivieren, ungültige Registrierung. */
    private void wipeAll() { wipe(); deleteKey(CANARY); }
    private static void deleteKey(String alias) {
        try { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); if (ks.containsAlias(alias)) ks.deleteEntry(alias); } catch (Exception ignored) {}
    }
    /** ok | invalidated (seit dem Anlegen wurde ein Fingerabdruck registriert) | missing | error (Keystore vorübergehend) */
    private static String canaryState() {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
            SecretKey k = (SecretKey) ks.getKey(CANARY, null);
            if (k == null) return "missing";
            Cipher.getInstance("AES/GCM/NoPadding").init(Cipher.ENCRYPT_MODE, k);   // nur init: prüft die Gültigkeit, braucht keinen Fingerabdruck
            return "ok";
        } catch (KeyPermanentlyInvalidatedException e) { return "invalidated"; }
        catch (Exception e) { return "error"; }
    }

    private String availability() {
        if (Build.VERSION.SDK_INT < 23) return "noHardware";
        // Fingerabdrucksensor vorausgesetzt (Audit run-3 #2): der Keystore-Schlüssel gilt zwar für jede starke Biometrie, aber ein reines
        // Gesichtserkennungs-Gerät darf den „Fingerabdruck“-Slot nicht anlegen
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) return "noHardware";
        switch (BiometricManager.from(getContext()).canAuthenticate(AUTH)) {
            case BiometricManager.BIOMETRIC_SUCCESS: return "ok";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE: return "noHardware";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED: return "noneEnrolled";
            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED: return "noStrong";
            default: return "unavailable";
        }
    }

    private void createKey() throws Exception { createKey(ALIAS); }
    private void createKey(String alias) throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        boolean strongBox = Build.VERSION.SDK_INT >= 28 && getContext().getPackageManager().hasSystemFeature("android.hardware.strongbox_keystore");
        for (int attempt = 0; attempt < 2; attempt++) {
            KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256)
                .setRandomizedEncryptionRequired(true).setUserAuthenticationRequired(true);
            if (Build.VERSION.SDK_INT >= 24) b.setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT >= 28 && strongBox && attempt == 0) b.setIsStrongBoxBacked(true);
            if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
            try { kg.init(b.build()); kg.generateKey(); return; }
            catch (Exception e) { if (attempt == 0 && strongBox) continue; throw e; }   // StrongBox nicht nutzbar → TEE-Schlüssel
        }
    }
    private Cipher cipherFor(int mode, byte[] iv) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        SecretKey k = (SecretKey) ks.getKey(ALIAS, null);
        if (k == null) throw new IllegalStateException("nokey");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        if (mode == Cipher.ENCRYPT_MODE) c.init(mode, k); else c.init(mode, k, new GCMParameterSpec(128, iv));
        return c;
    }

    @PluginMethod
    public void available(PluginCall call) {
        String a = availability(); JSObject o = new JSObject(); o.put("ok", "ok".equals(a)); o.put("reason", a); call.resolve(o);
    }

    /** enabled = Slot vorhanden, gleicher Boot (oder keep gesetzt), Schlüssel gültig. reason: ok | none | reboot | invalidated | unavailable;
     *  bei enabled zusätzlich keep = gilt der Slot über einen Neustart hinaus (nur zur Anzeige im JS).
     *  Neustart löscht Datei + Schlüssel SOFORT (Audit run-3 #6; das JS merkt sich nur einen Marker und bewaffnet nach der Passphrase neu);
     *  ein ungültiger Schlüssel (neuer Fingerabdruck) wird gelöscht; ein vorübergehender Keystore-Fehler löscht NICHT (unavailable). */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        // Neue Registrierung schlägt Neustart (Tresor-Audit run-5 #1): Kanarie VOR der Boot-Prüfung und auch ohne Slot-Datei prüfen
        if ("invalidated".equals(canaryState())) { wipeAll(); o.put("enabled", false); o.put("reason", "invalidated"); call.resolve(o); return; }
        JSONObject st = readState();
        if (st == null) { o.put("enabled", false); o.put("reason", "none"); call.resolve(o); return; }
        final boolean keep = st.optBoolean("keep", false);   // v1.8: beim Aktivieren gewählt, in der AAD mitauthentisiert — der Neustart-Zwang entfällt nur dann
        if (!keep && !sameBoot(st.optString("boot", null))) { wipe(); o.put("enabled", false); o.put("reason", "reboot"); call.resolve(o); return; }
        try { cipherFor(Cipher.DECRYPT_MODE, Base64.decode(st.getString("iv"), Base64.NO_WRAP)); }
        catch (KeyPermanentlyInvalidatedException e) { wipe(); o.put("enabled", false); o.put("reason", "invalidated"); call.resolve(o); return; }
        catch (IllegalStateException e) { wipe(); o.put("enabled", false); o.put("reason", "none"); call.resolve(o); return; }   // Datei ohne Schlüssel
        catch (Exception e) { o.put("enabled", false); o.put("reason", "unavailable"); call.resolve(o); return; }
        // Übergang von ≤ v1.6 (Review v1.6.1 H2): Slot-Schlüssel gültig = seit dem Einrichten kein Finger registriert → eine jetzt angelegte
        // Kanarie ist gleichwertig. Wer die App vor dem nächsten Neustart öffnet, muss nach dem Update nichts neu aktivieren.
        if ("missing".equals(canaryState())) { try { createKey(CANARY); } catch (Exception ignored) {} }
        o.put("enabled", true); o.put("reason", "ok"); o.put("keep", keep); call.resolve(o);
    }

    @PluginMethod
    public void disable(PluginCall call) { wipeAll(); call.resolve(); }

    /** Frischen Keystore-Schlüssel anlegen, Fingerabdruck abfragen, Zufall verschlüsselt ablegen. Alter Slot wird vorher verworfen. */
    @PluginMethod
    public void enroll(PluginCall call) {
        byte[] secret;
        try { secret = Base64.decode(call.getString("secret", ""), Base64.NO_WRAP); } catch (Exception e) { secret = null; }
        if (secret == null || secret.length != 32) { call.reject("invalid"); return; }
        if (!"ok".equals(availability())) { call.reject("unavailable"); return; }
        final boolean rearm = Boolean.TRUE.equals(call.getBoolean("rearm", false));
        // v1.8: „Fingerabdruck auch nach Neustart“ (Kästchen beim Aktivieren, ab Werk aus). Eine automatische Neu-Einrichtung nach dem
        // Neustart gibt es nur für Slots OHNE keep — deshalb schließen sich rearm und keep aus.
        final boolean keep = Boolean.TRUE.equals(call.getBoolean("keep", false)) && !rearm;
        if (rearm) {
            // Automatische Neu-Einrichtung nach Neustart NUR mit gültiger Kanarie: sonst wurde seit dem bewussten Aktivieren ein
            // Fingerabdruck registriert (oder es gab nie ein bewusstes Aktivieren) → der Nutzer muss es in den Einstellungen selbst tun.
            String cs = canaryState();
            // missing = Slot aus der Zeit vor der Kanarie (Update von ≤ v1.6) oder nie bewusst aktiviert: ebenfalls nichts einrichten,
            // aber eigener Code — kein Alarm „fremder Finger“, nur die Bitte, bewusst neu zu aktivieren (Alien-Pass-Besonderheit)
            if (!"ok".equals(cs)) { if ("error".equals(cs)) { call.reject("unavailable"); } else { wipeAll(); call.reject("missing".equals(cs) ? "nocanary" : "invalidated"); } return; }
        }
        wipe();
        final Cipher c;
        try { if (!rearm) { deleteKey(CANARY); createKey(CANARY); } createKey(); c = cipherFor(Cipher.ENCRYPT_MODE, null); }   // bewusstes Aktivieren: frische Kanarie
        catch (Exception e) { wipeAll(); call.reject("error"); return; }
        final byte[] sec = secret;
        final String boot = bootTag();
        final String ad = keep ? boot + "|keep" : boot;                           // ohne keep exakt wie bisher → Slots von ≤ v1.7 laufen unverändert weiter
        prompt(call, c, cipher -> {
            aad(cipher, ad);                                                      // Boot-Kennung (+ keep-Wahl) mitauthentisiert (Audit run-3, v1.8)
            byte[] ct = cipher.doFinal(sec); Arrays.fill(sec, (byte) 0);
            JSONObject st = new JSONObject();
            st.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            st.put("ct", Base64.encodeToString(ct, Base64.NO_WRAP));
            st.put("boot", boot);
            if (keep) st.put("keep", true);
            writeState(st);
            return new JSObject();
        }, true);
    }

    /** Fingerabdruck abfragen, Zufall entschlüsselt zurückgeben (JS packt damit den DEK aus und nullt die Bytes). */
    @PluginMethod
    public void unlock(PluginCall call) {
        if ("invalidated".equals(canaryState())) { wipeAll(); call.reject("invalidated"); return; }   // Tresor-Audit run-5 #1
        JSONObject st = readState();
        if (st == null) { call.reject("none"); return; }
        final boolean keep = st.optBoolean("keep", false);   // v1.8: nur ein mit keep angelegter Slot überlebt den Neustart
        if (!keep && !sameBoot(st.optString("boot", null))) { wipe(); call.reject("reboot"); return; }
        final byte[] ct; final Cipher c;
        try { ct = Base64.decode(st.getString("ct"), Base64.NO_WRAP); c = cipherFor(Cipher.DECRYPT_MODE, Base64.decode(st.getString("iv"), Base64.NO_WRAP)); }
        catch (KeyPermanentlyInvalidatedException e) { wipe(); call.reject("invalidated"); return; }
        catch (Exception e) { wipe(); call.reject("error"); return; }
        final String boot = st.optString("boot", "");
        final String ad = keep ? boot + "|keep" : boot;
        prompt(call, c, cipher -> {
            aad(cipher, ad);                                                      // gleiche AAD wie beim Anlegen; Klartext-Feld (boot ODER keep) manipuliert → GCM-Fehler
            byte[] pt = cipher.doFinal(ct);
            String s = Base64.encodeToString(pt, Base64.NO_WRAP); Arrays.fill(pt, (byte) 0);
            JSObject o = new JSObject(); o.put("secret", s); return o;
        }, false);
    }

    /** Boot-Kennung (+ keep) als GCM-AAD, IMMER — auch die Zeit-Rückfallform: unlock() nimmt den GESPEICHERTEN Wert, die Toleranz gilt nur
     *  in sameBoot, darum bricht die AAD nie an der Abweichung. Ohne AAD wäre keep im Klartext frei setzbar (Audit run-8 #4). */
    private static void aad(Cipher c, String boot) {
        if (boot != null && !boot.isEmpty()) c.updateAAD(boot.getBytes(StandardCharsets.UTF_8));
    }

    private interface Work { JSObject run(Cipher c) throws Exception; }
    private void prompt(final PluginCall call, final Cipher c, final Work work, final boolean wipeOnFail) {
        final FragmentActivity act = getActivity();
        if (act == null) { if (wipeOnFail) wipe(); call.reject("error"); return; }
        act.runOnUiThread(() -> {
            try {
                BiometricPrompt.PromptInfo.Builder pb = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(call.getString("title", "Alien Notes")).setNegativeButtonText(call.getString("negative", "Cancel"))
                    .setAllowedAuthenticators(AUTH).setConfirmationRequired(true);   // passive Biometrie (Gesicht) braucht einen bewussten Tipp; Fingerabdruck unberührt (Audit run-3 #2)
                String sub = call.getString("subtitle", "");
                if (sub != null && !sub.isEmpty()) pb.setSubtitle(sub);
                BiometricPrompt bp = new BiometricPrompt(act, ContextCompat.getMainExecutor(act), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                        try {
                            Cipher cc = r.getCryptoObject() != null ? r.getCryptoObject().getCipher() : null;
                            if (cc == null) throw new IllegalStateException("nocrypto");
                            call.resolve(work.run(cc));
                        } catch (javax.crypto.AEADBadTagException e) { call.reject("tampered"); }   // Klartext-Feld (boot/keep) der Slot-Datei verändert: nie „vorübergehend“, kein automatisches Wipe (Audit run-8 #16)
                        catch (Exception e) { if (wipeOnFail) wipe(); call.reject("error"); }
                    }
                    @Override public void onAuthenticationError(int code, CharSequence msg) {
                        if (wipeOnFail) wipe();
                        boolean cancel = code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_CANCELED;
                        boolean lockout = code == BiometricPrompt.ERROR_LOCKOUT || code == BiometricPrompt.ERROR_LOCKOUT_PERMANENT;
                        call.reject(cancel ? "cancel" : lockout ? "lockout" : "error");
                    }
                    // onAuthenticationFailed: einzelner Fehlversuch — der Prompt bleibt offen, das System zählt und sperrt selbst
                });
                bp.authenticate(pb.build(), new BiometricPrompt.CryptoObject(c));
            } catch (Exception e) { if (wipeOnFail) wipe(); call.reject("error"); }
        });
    }
}
`;
//   6) SecureScreen-Plugin (Alien Notes): FLAG_SECURE zur Laufzeit setzen/löschen. MainActivity setzt die Flagge beim Start; das JS ruft
//      set(false) nur in einer entsperrten Sitzung mit settings.secure=0 und set(true) bei jeder Sperre (App-Logik in app.js: applySecure).
const SEC = JAVA_DIR + '/SecureScreenPlugin.java';
const SEC_SRC = `package org.alieninvestor.notes;

import android.view.WindowManager;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** FLAG_SECURE (kein Screenshot, keine Vorschau im App-Umschalter) zur Laufzeit: set({on:true|false}).
 *  Keine Berechtigung, liest nichts. Der Sperrbildschirm ist immer geschützt — das JS ruft set(true) vor jeder Sperre. */
@CapacitorPlugin(name = "SecureScreen")
public class SecureScreenPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final boolean on = !Boolean.FALSE.equals(call.getBoolean("on", true));   // im Zweifel AN
        final FragmentActivity act = getActivity();
        if (act == null) { call.reject("error"); return; }
        act.runOnUiThread(() -> {
            try {
                if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                call.resolve();
            } catch (Exception e) { call.reject("error"); }
        });
    }
}
`;
//   7) VaultStore-Plugin (Alien Notes, 24.09.2026): die Notizen-Datei liegt im privaten App-Ordner (files/alien-notes/notes.ainv) statt im
//      localStorage der WebView — dessen Quota (~5 MB) kappte die Notizen bei ~3,9 MB Text. Atomar: Temp + fsync + rename, Größe nachgeprüft.
//      Keine Berechtigung, kein Netz; der Ordner fällt unter allowBackup=false + dataExtractionRules (kein Cloud-/Geräte-Backup).
const VS = JAVA_DIR + '/VaultStorePlugin.java';
const VS_SRC = `package org.alieninvestor.notes;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Notizen-Datei im privaten App-Ordner: read() -> {data: string|null}, write({data}) -> {ok}, del() -> {ok}.
 *  Schreiben atomar (Temp-Datei, fsync, rename ueber die alte Datei), Groesse nach dem Schreiben geprueft — nie eine halbe Datei. */
@CapacitorPlugin(name = "VaultStore")
public class VaultStorePlugin extends Plugin {
    private static final long MAX = 64L * 1024 * 1024;   // Lesegrenze; die App selbst erlaubt 20 MB (MAX_FILE_BYTES)

    private File dir() { File d = new File(getContext().getFilesDir(), "alien-notes"); if (!d.isDirectory()) d.mkdirs(); return d; }
    private File file() { return new File(dir(), "notes.ainv"); }
    private File tmp() { return new File(dir(), ".notes.ainv.tmp"); }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            File f = file(); JSObject o = new JSObject();
            if (!f.exists()) { o.put("data", JSObject.NULL); call.resolve(o); return; }
            long n = f.length(); if (n > MAX) { call.reject("toolarge"); return; }
            byte[] b = new byte[(int) n]; int off = 0;
            try (InputStream in = new FileInputStream(f)) { while (off < b.length) { int r = in.read(b, off, b.length - off); if (r < 0) break; off += r; } }
            if (off != b.length) { call.reject("short"); return; }
            o.put("data", new String(b, StandardCharsets.UTF_8)); call.resolve(o);
        } catch (Exception e) { call.reject("error"); }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String s = call.getString("data"); if (s == null) { call.reject("nodata"); return; }
        byte[] b = s.getBytes(StandardCharsets.UTF_8); File f = file(), t = tmp();
        try {
            try (FileOutputStream out = new FileOutputStream(t, false)) { out.write(b); out.flush(); out.getFD().sync(); }
            if (t.length() != b.length) { t.delete(); call.reject("short"); return; }
            if (!t.renameTo(f)) { t.delete(); call.reject("rename"); return; }
            if (f.length() != b.length) { call.reject("verify"); return; }
            JSObject o = new JSObject(); o.put("ok", true); call.resolve(o);
        } catch (Exception e) { t.delete(); call.reject("error"); }
    }

    @PluginMethod
    public void del(PluginCall call) {
        try {
            File f = file(); if (f.exists() && !f.delete()) { call.reject("error"); return; }
            tmp().delete();
            JSObject o = new JSObject(); o.put("ok", true); call.resolve(o);
        } catch (Exception e) { call.reject("error"); }
    }
}
`;
//   5) Tastatur-Bitte (v1.13, Entscheidung Nutzer 13.10.2026, alle drei Apps, ohne Schalter): jedes Eingabefeld bittet die Tastatur-App,
//      nichts daraus zu lernen (IME_FLAG_NO_PERSONALIZED_LEARNING, API 26; Gboard zeigt dann sein Inkognito-Symbol). Nur eine BITTE — mitlesen kann
//      die Tastatur trotzdem, und nicht jede beachtet sie. Chromium setzt das Flag nur für Inkognito-Profile, eine WebView ist nie eines; darum
//      ODER-t eine eigene Unterklasse es NACH super in die EditorInfo (vorher gesetzt würde es überschrieben). Eingehängt über ein App-Layout
//      gleichen Namens, das das Bibliotheks-Layout bridge_layout_main ersetzt (BridgeActivity.setContentView; Bridge sucht R.id.webview und
//      prüft instanceof CapacitorWebView → setBridge bleibt gültig). Die Konstante setzt javac als Zahl ein: unter API 26 ignoriert die Tastatur das Bit.
const WV = JAVA_DIR + '/NoLearnWebView.java';
const WV_SRC = `package org.alieninvestor.notes;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import com.getcapacitor.CapacitorWebView;

// Alien Notes (v1.13): bittet die Tastatur-App, aus keinem Feld der App zu lernen (patch-hardening.mjs, Abschnitt 5).
public class NoLearnWebView extends CapacitorWebView {

    public NoLearnWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
        return ic;
    }
}
`;
const LAYOUT_DIR = 'android/app/src/main/res/layout';
const LAYOUT = LAYOUT_DIR + '/bridge_layout_main.xml';
const LAYOUT_SRC = `<?xml version="1.0" encoding="utf-8"?>
<!-- Alien Notes (v1.13, patch-hardening.mjs): ersetzt das gleichnamige Layout aus Capacitor; einzige Abweichung ist die eigene WebView-Klasse (Tastatur-Bitte). -->
<androidx.coordinatorlayout.widget.CoordinatorLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context="com.getcapacitor.BridgeActivity"
    >

    <org.alieninvestor.notes.NoLearnWebView
        android:id="@+id/webview"
        android:layout_width="fill_parent"
        android:layout_height="fill_parent" />

</androidx.coordinatorlayout.widget.CoordinatorLayout>
`;
if (!existsSync(LAYOUT_DIR)) mkdirSync(LAYOUT_DIR, { recursive: true });

let changed = false;
for (const [file, src, label] of [[MAIN, MAIN_SRC, 'MainActivity (FLAG_SECURE + kein Autofill + Plugin-Registrierung)'], [CLIP, CLIP_SRC, 'SecureClipPlugin'], [BIO, BIO_SRC, 'BiometricPlugin'], [SEC, SEC_SRC, 'SecureScreenPlugin'], [VS, VS_SRC, 'VaultStorePlugin'], [WV, WV_SRC, 'NoLearnWebView (Tastatur-Bitte)'], [LAYOUT, LAYOUT_SRC, 'bridge_layout_main.xml (eigene WebView)']]) {
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (cur !== src) { writeFileSync(file, src); changed = true; console.log(label + ': geschrieben.'); }
}
if (!changed) console.log('MainActivity + SecureClipPlugin + BiometricPlugin + SecureScreenPlugin + VaultStorePlugin + NoLearnWebView + Layout bereits aktuell.');
// v1.14 (Sachwert-Tresor v3.11, Release-Audit run-11 b-1/e-1): erwarteter onCreate-Rumpf der MainActivity, WÖRTLICH und unabhängig von MAIN_SRC oben —
// eine Änderung an MAIN_SRC (auskommentiertes addFlags, if/return davor, zusätzlicher Aufruf) fällt so gegen diese zweite Kopie auf
const ONCREATE_SRC = "    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        dropAutofillRestore(getIntent());\n        registerPlugin(SecureClipPlugin.class);\n        registerPlugin(BiometricPlugin.class);\n        registerPlugin(SecureScreenPlugin.class);\n        registerPlugin(VaultStorePlugin.class);\n        super.onCreate(savedInstanceState);\n        // Kein Screenshot/Screen-Recording, keine Vorschau im App-Switcher (Recents) — ab Werk und auf dem Sperrbildschirm IMMER;\n        // eine entsperrte Sitzung darf die Flagge über SecureScreenPlugin.set(false) aufheben (Einstellung, Entscheidung 24.09.2026)\n        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);\n        // Kein Android-Autofill (API 26+): Die WebView meldet sonst jedes Passwortfeld an den systemweiten Autofill-Dienst — eine\n        // fremde App, die den Inhalt zum Speichern anbieten könnte. autocomplete=\"off\" im HTML hält das nicht auf. Die App hat\n        // bewusst keinen eigenen Autofill-Dienst, darum braucht sie das Framework auch nicht.\n        if (Build.VERSION.SDK_INT >= 26) {\n            View webView = getBridge().getWebView();\n            webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);\n        }\n    }\n";
// v1.14 (run-12 c-1): Laufzeit-Schalter und Absturz-Hebel ebenfalls WÖRTLICH als zweite, unabhängige Kopie — vertauschte Zweige, eine vergessene Negation
// oder ein Blockkommentar im SecureScreenPlugin schalteten FLAG_SECURE nach dem ersten Entsperren dauerhaft ab; eine umgedrehte Null-Prüfung in
// dropAutofillRestore öffnete den Absturz-Hebel aus v1.5. Dazu: in beiden Dateien kein Blockkommentar außer dem bekannten Klassenkommentar, keine \u-Escapes.
const SET_SRC = "    @PluginMethod\n    public void set(PluginCall call) {\n        final boolean on = !Boolean.FALSE.equals(call.getBoolean(\"on\", true));   // im Zweifel AN\n        final FragmentActivity act = getActivity();\n        if (act == null) { call.reject(\"error\"); return; }\n        act.runOnUiThread(() -> {\n            try {\n                if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);\n                else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);\n                call.resolve();\n            } catch (Exception e) { call.reject(\"error\"); }\n        });\n    }\n";
const DROP_SRC = "    private static void dropAutofillRestore(Intent i) {\n        if (i == null) return;\n        i.removeExtra(\"android.view.autofill.extra.RESTORE_SESSION_TOKEN\");\n        i.removeExtra(\"android.view.autofill.extra.RESTORE_CROSS_ACTIVITY\");\n    }\n";
const SEC_DOC = "/** FLAG_SECURE (kein Screenshot, keine Vorschau im App-Umschalter) zur Laufzeit: set({on:true|false}).\n *  Keine Berechtigung, liest nichts. Der Sperrbildschirm ist immer geschützt — das JS ruft set(true) vor jeder Sperre. */";
// v1.14 (Release-Audit run-12 c2-1): Fingerabdruck-Schlüssel, Abfrage-Dialog und SecureClip ebenfalls WÖRTLICH als zweite Kopie — bis dahin genügte das
// bloße Wort, ein auskommentiertes setUserAuthenticationRequired(true) (Schlüssel ohne Nutzer-Bestätigung: ein neu registrierter fremder Finger öffnete die
// Notizen) oder eine gelöschte EXTRA_IS_SENSITIVE-Zeile (das Wort steht auch im Klassenkommentar) blieb grün. Die übrigen Wort-Prüfungen laufen auf dem Text
// OHNE Kommentare (jbc/jcc); Unicode-Escapes (auch \\uu…, JLS 3.3) sind in keiner Plugin-Datei erlaubt.
const CREATEKEY_SRC = "    private void createKey(String alias) throws Exception {\n        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, \"AndroidKeyStore\");\n        boolean strongBox = Build.VERSION.SDK_INT >= 28 && getContext().getPackageManager().hasSystemFeature(\"android.hardware.strongbox_keystore\");\n        for (int attempt = 0; attempt < 2; attempt++) {\n            KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)\n                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256)\n                .setRandomizedEncryptionRequired(true).setUserAuthenticationRequired(true);\n            if (Build.VERSION.SDK_INT >= 24) b.setInvalidatedByBiometricEnrollment(true);\n            if (Build.VERSION.SDK_INT >= 28 && strongBox && attempt == 0) b.setIsStrongBoxBacked(true);\n            if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);\n            try { kg.init(b.build()); kg.generateKey(); return; }\n            catch (Exception e) { if (attempt == 0 && strongBox) continue; throw e; }   // StrongBox nicht nutzbar → TEE-Schlüssel\n        }\n    }\n";
const PROMPT_SRC = "                BiometricPrompt.PromptInfo.Builder pb = new BiometricPrompt.PromptInfo.Builder()\n                    .setTitle(call.getString(\"title\", \"Alien Notes\")).setNegativeButtonText(call.getString(\"negative\", \"Cancel\"))\n                    .setAllowedAuthenticators(AUTH).setConfirmationRequired(true);   // passive Biometrie (Gesicht) braucht einen bewussten Tipp; Fingerabdruck unberührt (Audit run-3 #2)\n";
const CLIPWRITE_SRC = "    @PluginMethod\n    public void write(PluginCall call) {\n        String text = call.getString(\"text\", \"\");\n        try {\n            ClipData clip = ClipData.newPlainText(\"\", text);\n            if (Build.VERSION.SDK_INT >= 33) {\n                PersistableBundle extras = new PersistableBundle();\n                extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true);\n                clip.getDescription().setExtras(extras);\n            }\n            cm().setPrimaryClip(clip);\n            call.resolve();\n        } catch (Exception e) { call.reject(\"clip\"); }\n    }\n";
const jm = readFileSync(MAIN, 'utf8'), jb = readFileSync(BIO, 'utf8'), jc = readFileSync(CLIP, 'utf8');
const CLEAR_SRC = "    @PluginMethod\n    public void clear(PluginCall call) {\n        try {\n            if (Build.VERSION.SDK_INT >= 28) cm().clearPrimaryClip();\n            else cm().setPrimaryClip(ClipData.newPlainText(\"\", \" \"));\n            call.resolve();\n        } catch (Exception e) { call.reject(\"clip\"); }\n    }\n";
// Kommentare in EINEM Durchlauf von links nach rechts wie javac (run-12 c3-3): erst Blockkommentare, dann Zeilenkommentare zu entfernen las `//*…*/ code`
// falsch (javac: alles Kommentar; vorher blieb `/ code` stehen) und `"…//…"` als Kommentarbeginn. Zeichenketten und Zeichen bleiben stehen.
// Einzige Abweichung von javac: noComments kennt nur LF als Zeilenende, javac auch ein einzelnes CR (JLS 3.4) — `// x<CR> code` verbärge Code. Darum ist
// rohes CR in allen sechs Java-Dateien verboten (unten, v1.15, Querfund Pass run-13 d-5), statt noComments umzubauen.
const noComments = (t) => t.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => (m[0] === '/' ? '' : m));
const jbc = noComments(jb), jcc = noComments(jc);
const js = readFileSync(SEC, 'utf8'), jv = readFileSync(VS, 'utf8'), jwr = readFileSync(WV, 'utf8'), jvc = noComments(jv);
if (!jm.includes('getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE)') || !jm.includes('setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS)') || !jm.includes('if ("autofill".equals(name)) return null;') || !jm.includes('return super.getSystemService(name);') || /\/\/[^\n]*if \("autofill"\.equals/.test(jm) || /\/\/[^\n]*dropAutofillRestore\(|\/\*/.test(jm)
  || !jm.includes('dropAutofillRestore(getIntent());') || !jm.includes('dropAutofillRestore(intent);') || !jm.includes('i.removeExtra("android.view.autofill.extra.RESTORE_SESSION_TOKEN");') || !jm.includes('i.removeExtra("android.view.autofill.extra.RESTORE_CROSS_ACTIVITY");') || !jm.includes('registerPlugin(SecureClipPlugin.class)') || !jm.includes('registerPlugin(BiometricPlugin.class)') || !jm.includes('registerPlugin(SecureScreenPlugin.class)') || !jm.includes('registerPlugin(VaultStorePlugin.class)')
  // v1.14 (Tresor run-11 b-1/e-1): FLAG_SECURE und die vier Plugin-Registrierungen wörtlich und an ihrer Stelle — bis 1.13 genügte das bloße Wort, und
  // ein auskommentiertes `// registerPlugin(…)` oder `// getWindow().addFlags(…)` blieb grün; kein clearFlags/setFlags in der MainActivity (der Laufzeit-Schalter
  // liegt allein im SecureScreenPlugin), nichts davon hinter //, genau vier registerPlugin, der ganze onCreate-Rumpf wie ONCREATE_SRC und genau einmal
  || !jm.includes('\n        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);\n') || /clearFlags|setFlags|setAttributes/.test(jm)
  || /\/\/[^\n]*(FLAG_SECURE|registerPlugin\(|addFlags|setImportantForAutofill)/.test(jm) || (jm.match(/registerPlugin\(/g) || []).length !== 4
  || !jm.includes(ONCREATE_SRC) || (jm.match(/public void onCreate\(/g) || []).length !== 1
  // v1.14 (run-12 c-1): set() und dropAutofillRestore wörtlich und je genau einmal; kein /* (außer dem Klassenkommentar des Plugins), keine \\u-Escapes
  || !js.includes(SET_SRC) || (js.match(/public void set\(/g) || []).length !== 1 || !jm.includes(DROP_SRC) || (jm.match(/void dropAutofillRestore\(/g) || []).length !== 1
  || /\/\*|\*\//.test(js.replace(SEC_DOC, '')) || /\/\*|\*\//.test(jm) || /\\u+[0-9a-fA-F]{4}/.test(js) || /\\u+[0-9a-fA-F]{4}/.test(jm)
  // VaultStore: atomar (fsync + rename), Groesse geprueft, privater App-Ordner, genau drei Methoden
  || !jvc.includes('getFD().sync()') || !jvc.includes('renameTo(f)') || !jvc.includes('f.length() != b.length') || !jvc.includes('getFilesDir()') || (jvc.match(/@PluginMethod/g) || []).length !== 3
  // SecureScreen: beide Richtungen vorhanden, Default AN, kein anderer Weg als set()
  || !js.includes('addFlags(WindowManager.LayoutParams.FLAG_SECURE)') || !js.includes('clearFlags(WindowManager.LayoutParams.FLAG_SECURE)') || !js.includes('call.getBoolean("on", true)') || (js.match(/@PluginMethod/g) || []).length !== 1
  || !jcc.includes('extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true);') || !jcc.includes('clip.getDescription().setExtras(extras);')
  || !jc.includes(CLIPWRITE_SRC) || (jc.match(/public void write\(/g) || []).length !== 1
  // Zählungen auf dem Rohtext UND ohne Kommentare je genau 1 (run-12 r4-3): sonst bestand eine wörtliche Kopie in /* … */ über einer geänderten Methode
  || !jb.includes(CREATEKEY_SRC) || [jb, jbc].some((t) => (t.match(/KeyGenParameterSpec\.Builder\s*\(/g) || []).length !== 1 || (t.match(/void\s+createKey\s*\(\s*String\s/g) || []).length !== 1)
  // v1.14 (run-12 c3-1/c3-2): auch clear() wörtlich (Auto-Leeren der Zwischenablage), und der Abfrage-Dialog setzt Bestätigung und Authenticator genau
  // einmal — ein zweiter Setter NACH der wörtlichen Kopie (pb.setConfirmationRequired(false)) hob sie sonst auf
  || !jc.includes(CLEAR_SRC) || [jc, jcc].some((t) => (t.match(/public\s+void\s+clear\s*\(/g) || []).length !== 1)
  || [jb, jbc].some((t) => (t.match(/setConfirmationRequired\s*\(/g) || []).length !== 1 || (t.match(/setAllowedAuthenticators\s*\(/g) || []).length !== 1)
  || !jb.includes(PROMPT_SRC) || [jb, jbc].some((t) => (t.match(/PromptInfo\.Builder\(\)/g) || []).length !== 1)   // roh UND ohne Kommentare (v1.15, Pass run-13 d-7: vorher nur roh)
  || !jbc.includes('b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);')
  || [jm, js, jb, jc, jv, jwr].some((t) => /\\u+[0-9a-fA-F]{4}/.test(t) || t.includes('"""'))   // keine Unicode-Escapes, keine Textblöcke (noComments kennt sie nicht)
  // v1.14 (run-12 c2 Hinweis 2): FLAG_SECURE auch nicht über die LayoutParams (lp.flags &= ~FLAG_SECURE; updateViewLayout) — kein clearFlags nötig
  || [jm, js, jb, jc, jv, jwr].some((t) => /updateViewLayout|\.flags\b|getAttributes\s*\(|onWindowAttributesChanged|LayoutParams\s*\(/.test(noComments(t)))
  || [jm, jb, jc, jv, jwr].some((t) => /clearFlags|setFlags|setAttributes/.test(noComments(t)))   // der Laufzeit-Schalter liegt allein im SecureScreenPlugin
  || (noComments(js).match(/clearFlags/g) || []).length !== 1 || (noComments(js).match(/addFlags/g) || []).length !== 1 || /setFlags|setAttributes/.test(noComments(js))
  || !jbc.includes('setUserAuthenticationRequired(true)') || !jbc.includes('setInvalidatedByBiometricEnrollment(true)') || !jbc.includes('BIOMETRIC_STRONG') || !jbc.includes('sameBoot(')
  || !jbc.includes('setConfirmationRequired(true)') || !jbc.includes('FEATURE_FINGERPRINT')
  // AAD wirklich ANGEWENDET (der private Helfer allein genügt nicht — Audit run-8 #5): beide Aufrufe in enroll() und unlock() zählen
  || (jbc.match(/aad\(cipher, ad\);/g) || []).length !== 2 || !jbc.includes('c.updateAAD(boot.getBytes(') || !jbc.includes('Settings.Global.BOOT_COUNT')
  || !jbc.includes('canaryState()') || !/if \("invalidated"\.equals\(canaryState\(\)\)\) \{ wipeAll\(\); o\.put/.test(jbc) || (jbc.match(/"invalidated"\.equals\(canaryState\(\)\)/g) || []).length !== 2
  || !jbc.includes('call.getBoolean("rearm", false)') || !jbc.includes('"nocanary"')
  // v1.8 „Fingerabdruck auch nach Neustart“: die Wahl kommt vom JS, steht im Slot und hängt in der AAD; der Neustart-Zweig gilt nur
  // ohne keep — und zwar in status() UND unlock(), darum beide Vorkommen zählen; Default false und der Rearm-Riegel sind gepinnt (run-8 #5)
  || !jbc.includes('call.getBoolean("keep", false)) && !rearm') || (jbc.match(/boot \+ "\|keep"/g) || []).length !== 2 || !jbc.includes('st.put("keep", true)')
  || (jbc.match(/optBoolean\("keep", false\)/g) || []).length !== 2
  || (jbc.match(/!keep && !sameBoot\(/g) || []).length !== 2 || !jbc.includes('AEADBadTagException e) { call.reject("tampered")')
  // sameBoot: nur wenn BEIDE Kennungen die Zeit-Form haben, gilt die Toleranz — fiele die Zeile auf die alte id:-Form zurück, liefe b:5 gegen b:6
  // per parseLong in die ±120-s-Toleranz und die Neustart-Regel wäre still aus (Tresor-Diff-Review v3.2 N1)
  || !jbc.includes('if (!stored.startsWith("t:") || !now.startsWith("t:")) return stored.equals(now);')
  // Kanarie VOR dem keep-/Boot-Zweig, in status() UND unlock(): bei einem keep-Slot hängt die Warnung „neuer Finger“ allein daran (Tresor-Diff-Review v3.2 H1)
  || !(() => { const before = (from) => { const c = jbc.indexOf('"invalidated".equals(canaryState())', from), k = jbc.indexOf('!keep && !sameBoot(', from); return c > 0 && k > 0 && c < k; };
       return before(jbc.indexOf('public void status(')) && before(jbc.indexOf('public void unlock(')); })()
  || !/USE_FINGERPRINT"\s+android:maxSdkVersion="27"\s+tools:node="replace"/.test(readFileSync(MANIFEST, 'utf8'))) {   // cap sync bricht die Zeile um
  console.error('FEHLER: Java-Härtung unvollständig — Build abgebrochen!'); process.exit(1);
}
// v1.15 (Querfund Alien Pass v1.23 Release-Audit run-13 d-1…d-6 / r2d-1 / nb-1, Notes-Tabelle P17/P24/P28; Block wie Pass patch-hardening.mjs v1.24, die
// vierzehn Pin-Texte byte-gleich, gemessen 10.11.2026: jeder steht wörtlich in den Notes-Vorlagen oben): auch die übrigen Hebel WÖRTLICH als unabhängige
// Zweitkopie — bis dahin blieben eine Versionsweiche um den getSystemService-Hebel, eine Bedingung vor dropAutofillRestore in onNewIntent, ein fester
// Boot-Zähler, beide aad()-Aufrufe als Zeichenkette, ein fünftes Plugin über getBridge().registerPlugin*/registerPluginInstance, ein umbenannter Plugin-Name
// (app.js fiele STILL auf den Web-Weg zurück: navigator.clipboard ohne IS_SENSITIVE, FLAG_SECURE ohne Schalter, Notizen im localStorage), ein `// x<CR>`-
// Versteck und Reflection grün. Dazu (Pass r2d-1/nb-1) die AUSWERTUNG der Neustart-Regel und der Kanarie — status(), enroll(), unlock() ab der Kopfzeile (die
// @PluginMethod-Zeile davor prüft pm() unten) — und WOHER das Ergebnis der Kanarie kommt (canaryState) samt wipe/wipeAll/deleteKey: eine stets falsche
// Bedingung (`… && keep`), ein `&& !rearm` oder ein canaryState(), das bei KeyPermanentlyInvalidatedException "ok" liefert, blieb sonst in Selbstprüfung UND
// Endkontrolle grün. Gegenstück am Bytecode: PIN_GETSYS … PIN_DELKEY in build-apk.sh. Notes-Teile: sechs Java-Dateien, vier Plugins (Köpfe von SecureScreen/
// VaultStore nach dem Muster CLIPHEAD/BIOHEAD), @PluginMethod-Menge auch für set bzw. read/write/del; dazu die Zählungen aus Pass v1.23 Runde 1, die Notes
// noch nicht hatte (onCreate/dropAutofillRestore/write/set je genau einmal, roh UND ohne Kommentare).
const GETSYS_SRC = "    @Override\n    public Object getSystemService(String name) {\n        if (\"autofill\".equals(name)) return null;   // Dienstname des AutofillManager (API 26+, Konstante ist nicht öffentlich)\n        return super.getSystemService(name);\n    }\n";
const NEWINTENT_SRC = "    @Override\n    protected void onNewIntent(Intent intent) {\n        dropAutofillRestore(intent);\n        super.onNewIntent(intent);\n    }\n";
const BOOTTAG_SRC = "    private String bootTag() {\n        try { int n = Settings.Global.getInt(getContext().getContentResolver(), Settings.Global.BOOT_COUNT); if (n > 0) return \"b:\" + n; } catch (Exception ignored) {}\n        try (BufferedReader r = new BufferedReader(new FileReader(\"/proc/sys/kernel/random/boot_id\"))) {\n            String s = r.readLine();\n            if (s != null && s.trim().length() >= 8) return \"id:\" + s.trim();\n        } catch (Exception ignored) {}\n        return \"t:\" + ((System.currentTimeMillis() - SystemClock.elapsedRealtime()) / 1000L);\n    }\n";
const SAMEBOOT_SRC = "    private boolean sameBoot(String stored) {\n        if (stored == null || stored.length() < 3) return false;\n        String now = bootTag();\n        if (!stored.startsWith(\"t:\") || !now.startsWith(\"t:\")) return stored.equals(now);\n        try { return Math.abs(Long.parseLong(stored.substring(2)) - Long.parseLong(now.substring(2))) <= 120; }\n        catch (Exception e) { return false; }\n    }\n";
const AAD_SRC = "    private static void aad(Cipher c, String boot) {\n        if (boot != null && !boot.isEmpty()) c.updateAAD(boot.getBytes(StandardCharsets.UTF_8));\n    }\n";
const CLIPHEAD_SRC = "@CapacitorPlugin(name = \"SecureClip\")\npublic class SecureClipPlugin extends Plugin {\n";
const BIOHEAD_SRC = "@CapacitorPlugin(name = \"Biometric\")\npublic class BiometricPlugin extends Plugin {\n";
const STATUS_SRC = "    public void status(PluginCall call) {\n        JSObject o = new JSObject();\n        // Neue Registrierung schlägt Neustart (Tresor-Audit run-5 #1): Kanarie VOR der Boot-Prüfung und auch ohne Slot-Datei prüfen\n        if (\"invalidated\".equals(canaryState())) { wipeAll(); o.put(\"enabled\", false); o.put(\"reason\", \"invalidated\"); call.resolve(o); return; }\n        JSONObject st = readState();\n        if (st == null) { o.put(\"enabled\", false); o.put(\"reason\", \"none\"); call.resolve(o); return; }\n        final boolean keep = st.optBoolean(\"keep\", false);   // v1.8: beim Aktivieren gewählt, in der AAD mitauthentisiert — der Neustart-Zwang entfällt nur dann\n        if (!keep && !sameBoot(st.optString(\"boot\", null))) { wipe(); o.put(\"enabled\", false); o.put(\"reason\", \"reboot\"); call.resolve(o); return; }\n        try { cipherFor(Cipher.DECRYPT_MODE, Base64.decode(st.getString(\"iv\"), Base64.NO_WRAP)); }\n        catch (KeyPermanentlyInvalidatedException e) { wipe(); o.put(\"enabled\", false); o.put(\"reason\", \"invalidated\"); call.resolve(o); return; }\n        catch (IllegalStateException e) { wipe(); o.put(\"enabled\", false); o.put(\"reason\", \"none\"); call.resolve(o); return; }   // Datei ohne Schlüssel\n        catch (Exception e) { o.put(\"enabled\", false); o.put(\"reason\", \"unavailable\"); call.resolve(o); return; }\n        // Übergang von ≤ v1.6 (Review v1.6.1 H2): Slot-Schlüssel gültig = seit dem Einrichten kein Finger registriert → eine jetzt angelegte\n        // Kanarie ist gleichwertig. Wer die App vor dem nächsten Neustart öffnet, muss nach dem Update nichts neu aktivieren.\n        if (\"missing\".equals(canaryState())) { try { createKey(CANARY); } catch (Exception ignored) {} }\n        o.put(\"enabled\", true); o.put(\"reason\", \"ok\"); o.put(\"keep\", keep); call.resolve(o);\n    }\n";
const ENROLL_SRC = "    public void enroll(PluginCall call) {\n        byte[] secret;\n        try { secret = Base64.decode(call.getString(\"secret\", \"\"), Base64.NO_WRAP); } catch (Exception e) { secret = null; }\n        if (secret == null || secret.length != 32) { call.reject(\"invalid\"); return; }\n        if (!\"ok\".equals(availability())) { call.reject(\"unavailable\"); return; }\n        final boolean rearm = Boolean.TRUE.equals(call.getBoolean(\"rearm\", false));\n        // v1.8: „Fingerabdruck auch nach Neustart“ (Kästchen beim Aktivieren, ab Werk aus). Eine automatische Neu-Einrichtung nach dem\n        // Neustart gibt es nur für Slots OHNE keep — deshalb schließen sich rearm und keep aus.\n        final boolean keep = Boolean.TRUE.equals(call.getBoolean(\"keep\", false)) && !rearm;\n        if (rearm) {\n            // Automatische Neu-Einrichtung nach Neustart NUR mit gültiger Kanarie: sonst wurde seit dem bewussten Aktivieren ein\n            // Fingerabdruck registriert (oder es gab nie ein bewusstes Aktivieren) → der Nutzer muss es in den Einstellungen selbst tun.\n            String cs = canaryState();\n            // missing = Slot aus der Zeit vor der Kanarie (Update von ≤ v1.6) oder nie bewusst aktiviert: ebenfalls nichts einrichten,\n            // aber eigener Code — kein Alarm „fremder Finger“, nur die Bitte, bewusst neu zu aktivieren (Alien-Pass-Besonderheit)\n            if (!\"ok\".equals(cs)) { if (\"error\".equals(cs)) { call.reject(\"unavailable\"); } else { wipeAll(); call.reject(\"missing\".equals(cs) ? \"nocanary\" : \"invalidated\"); } return; }\n        }\n        wipe();\n        final Cipher c;\n        try { if (!rearm) { deleteKey(CANARY); createKey(CANARY); } createKey(); c = cipherFor(Cipher.ENCRYPT_MODE, null); }   // bewusstes Aktivieren: frische Kanarie\n        catch (Exception e) { wipeAll(); call.reject(\"error\"); return; }\n        final byte[] sec = secret;\n        final String boot = bootTag();\n        final String ad = keep ? boot + \"|keep\" : boot;                           // ohne keep exakt wie bisher → Slots von ≤ v1.7 laufen unverändert weiter\n        prompt(call, c, cipher -> {\n            aad(cipher, ad);                                                      // Boot-Kennung (+ keep-Wahl) mitauthentisiert (Audit run-3, v1.8)\n            byte[] ct = cipher.doFinal(sec); Arrays.fill(sec, (byte) 0);\n            JSONObject st = new JSONObject();\n            st.put(\"iv\", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));\n            st.put(\"ct\", Base64.encodeToString(ct, Base64.NO_WRAP));\n            st.put(\"boot\", boot);\n            if (keep) st.put(\"keep\", true);\n            writeState(st);\n            return new JSObject();\n        }, true);\n    }\n";
const UNLOCK_SRC = "    public void unlock(PluginCall call) {\n        if (\"invalidated\".equals(canaryState())) { wipeAll(); call.reject(\"invalidated\"); return; }   // Tresor-Audit run-5 #1\n        JSONObject st = readState();\n        if (st == null) { call.reject(\"none\"); return; }\n        final boolean keep = st.optBoolean(\"keep\", false);   // v1.8: nur ein mit keep angelegter Slot überlebt den Neustart\n        if (!keep && !sameBoot(st.optString(\"boot\", null))) { wipe(); call.reject(\"reboot\"); return; }\n        final byte[] ct; final Cipher c;\n        try { ct = Base64.decode(st.getString(\"ct\"), Base64.NO_WRAP); c = cipherFor(Cipher.DECRYPT_MODE, Base64.decode(st.getString(\"iv\"), Base64.NO_WRAP)); }\n        catch (KeyPermanentlyInvalidatedException e) { wipe(); call.reject(\"invalidated\"); return; }\n        catch (Exception e) { wipe(); call.reject(\"error\"); return; }\n        final String boot = st.optString(\"boot\", \"\");\n        final String ad = keep ? boot + \"|keep\" : boot;\n        prompt(call, c, cipher -> {\n            aad(cipher, ad);                                                      // gleiche AAD wie beim Anlegen; Klartext-Feld (boot ODER keep) manipuliert → GCM-Fehler\n            byte[] pt = cipher.doFinal(ct);\n            String s = Base64.encodeToString(pt, Base64.NO_WRAP); Arrays.fill(pt, (byte) 0);\n            JSObject o = new JSObject(); o.put(\"secret\", s); return o;\n        }, false);\n    }\n";
const CANARY_SRC = "    private static String canaryState() {\n        try {\n            KeyStore ks = KeyStore.getInstance(\"AndroidKeyStore\"); ks.load(null);\n            SecretKey k = (SecretKey) ks.getKey(CANARY, null);\n            if (k == null) return \"missing\";\n            Cipher.getInstance(\"AES/GCM/NoPadding\").init(Cipher.ENCRYPT_MODE, k);   // nur init: prüft die Gültigkeit, braucht keinen Fingerabdruck\n            return \"ok\";\n        } catch (KeyPermanentlyInvalidatedException e) { return \"invalidated\"; }\n        catch (Exception e) { return \"error\"; }\n    }\n";
const WIPE_SRC = "    private void wipe() {\n        try { file().delete(); } catch (Exception ignored) {}\n        deleteKey(ALIAS);\n    }\n";
const WIPEALL_SRC = "    private void wipeAll() { wipe(); deleteKey(CANARY); }\n";
const DELKEY_SRC = "    private static void deleteKey(String alias) {\n        try { KeyStore ks = KeyStore.getInstance(\"AndroidKeyStore\"); ks.load(null); if (ks.containsAlias(alias)) ks.deleteEntry(alias); } catch (Exception ignored) {}\n    }\n";
const SECHEAD_SRC = "@CapacitorPlugin(name = \"SecureScreen\")\npublic class SecureScreenPlugin extends Plugin {\n";
const VSHEAD_SRC = "@CapacitorPlugin(name = \"VaultStore\")\npublic class VaultStorePlugin extends Plugin {\n";
// Release-Audit v1.15 Runde 1 (Prüfer b F1, 10.11.2026): auch die übrigen Methoden WÖRTLICH als unabhängige Zweitkopie — VaultStore prüfte bis dahin nur Wörter
// (getFD().sync(), renameTo(f) …), Biometric disable/available/cipherFor/readState/writeState/file/createKey()/prompt samt Rückruf und SecureClip.cm gar nicht: ein
// Notizen-Ordner im externen App-Speicher (getFilesDir() nur noch als Zeichenkette), ein still verschluckter fsync-Fehler, ein read() ohne Längenprüfung, ein
// disable() ohne wipeAll() oder ein System.loadLibrary blieben grün (Prüfer-Mutanten vs-dir-extern, vs-fsync-still, vs-read-kurz, bio-disable-leer, bio-jni).
// Gegenstück am Bytecode: PIN_VSREAD … PIN_CM samt catch-Tabellen und die Hash-Tabelle aller App-Methoden in build-apk.sh.
const VSMAX_SRC = "    private static final long MAX = 64L * 1024 * 1024;   // Lesegrenze; die App selbst erlaubt 20 MB (MAX_FILE_BYTES)\n";
const VSDIR_SRC = "    private File dir() { File d = new File(getContext().getFilesDir(), \"alien-notes\"); if (!d.isDirectory()) d.mkdirs(); return d; }\n";
const VSFILE_SRC = "    private File file() { return new File(dir(), \"notes.ainv\"); }\n";
const VSTMP_SRC = "    private File tmp() { return new File(dir(), \".notes.ainv.tmp\"); }\n";
const VSREAD_SRC = "    @PluginMethod\n    public void read(PluginCall call) {\n        try {\n            File f = file(); JSObject o = new JSObject();\n            if (!f.exists()) { o.put(\"data\", JSObject.NULL); call.resolve(o); return; }\n            long n = f.length(); if (n > MAX) { call.reject(\"toolarge\"); return; }\n            byte[] b = new byte[(int) n]; int off = 0;\n            try (InputStream in = new FileInputStream(f)) { while (off < b.length) { int r = in.read(b, off, b.length - off); if (r < 0) break; off += r; } }\n            if (off != b.length) { call.reject(\"short\"); return; }\n            o.put(\"data\", new String(b, StandardCharsets.UTF_8)); call.resolve(o);\n        } catch (Exception e) { call.reject(\"error\"); }\n    }\n";
const VSWRITE_SRC = "    @PluginMethod\n    public void write(PluginCall call) {\n        String s = call.getString(\"data\"); if (s == null) { call.reject(\"nodata\"); return; }\n        byte[] b = s.getBytes(StandardCharsets.UTF_8); File f = file(), t = tmp();\n        try {\n            try (FileOutputStream out = new FileOutputStream(t, false)) { out.write(b); out.flush(); out.getFD().sync(); }\n            if (t.length() != b.length) { t.delete(); call.reject(\"short\"); return; }\n            if (!t.renameTo(f)) { t.delete(); call.reject(\"rename\"); return; }\n            if (f.length() != b.length) { call.reject(\"verify\"); return; }\n            JSObject o = new JSObject(); o.put(\"ok\", true); call.resolve(o);\n        } catch (Exception e) { t.delete(); call.reject(\"error\"); }\n    }\n";
const VSDEL_SRC = "    @PluginMethod\n    public void del(PluginCall call) {\n        try {\n            File f = file(); if (f.exists() && !f.delete()) { call.reject(\"error\"); return; }\n            tmp().delete();\n            JSObject o = new JSObject(); o.put(\"ok\", true); call.resolve(o);\n        } catch (Exception e) { call.reject(\"error\"); }\n    }\n";
const BIOKONST_SRC = "    private static final String ALIAS = \"alien-notes-bio\";\n    /** Kanarien-Schlüssel (Tresor-Audit run-5 #1, identisch hier): gleiche Flags wie der Slot-Schlüssel, wird NIE benutzt und beim Neustart\n     *  NICHT gelöscht. Er entsteht nur beim bewussten Aktivieren und wird ungültig, sobald ein Fingerabdruck neu registriert wird — so bleibt\n     *  der Nachweis einer neuen Registrierung über den Neustart erhalten, obwohl der Slot selbst dort gelöscht wird. */\n    private static final String CANARY = \"alien-notes-bio-canary\";\n    private static final String FILE = \"alien-notes-bio.json\";\n    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_STRONG;\n";
const BIOFILE_SRC = "    private File file() { return new File(getContext().getFilesDir(), FILE); }\n";
const READSTATE_SRC = "    private JSONObject readState() {\n        File f = file();\n        if (!f.exists()) return null;\n        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {\n            StringBuilder sb = new StringBuilder(); String line;\n            while ((line = r.readLine()) != null) sb.append(line);\n            JSONObject o = new JSONObject(sb.toString());\n            if (!o.has(\"iv\") || !o.has(\"ct\") || !o.has(\"boot\")) return null;\n            return o;\n        } catch (Exception e) { return null; }\n    }\n";
const WRITESTATE_SRC = "    private void writeState(JSONObject o) throws Exception {\n        try (FileOutputStream out = new FileOutputStream(file())) { out.write(o.toString().getBytes(StandardCharsets.UTF_8)); }\n    }\n";
const AVAIL_SRC = "    private String availability() {\n        if (Build.VERSION.SDK_INT < 23) return \"noHardware\";\n        // Fingerabdrucksensor vorausgesetzt (Audit run-3 #2): der Keystore-Schlüssel gilt zwar für jede starke Biometrie, aber ein reines\n        // Gesichtserkennungs-Gerät darf den „Fingerabdruck“-Slot nicht anlegen\n        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) return \"noHardware\";\n        switch (BiometricManager.from(getContext()).canAuthenticate(AUTH)) {\n            case BiometricManager.BIOMETRIC_SUCCESS: return \"ok\";\n            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE: return \"noHardware\";\n            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED: return \"noneEnrolled\";\n            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED: return \"noStrong\";\n            default: return \"unavailable\";\n        }\n    }\n";
const CREATEKEY0_SRC = "    private void createKey() throws Exception { createKey(ALIAS); }\n";
const CIPHERFOR_SRC = "    private Cipher cipherFor(int mode, byte[] iv) throws Exception {\n        KeyStore ks = KeyStore.getInstance(\"AndroidKeyStore\"); ks.load(null);\n        SecretKey k = (SecretKey) ks.getKey(ALIAS, null);\n        if (k == null) throw new IllegalStateException(\"nokey\");\n        Cipher c = Cipher.getInstance(\"AES/GCM/NoPadding\");\n        if (mode == Cipher.ENCRYPT_MODE) c.init(mode, k); else c.init(mode, k, new GCMParameterSpec(128, iv));\n        return c;\n    }\n";
const AVAILABLE_SRC = "    @PluginMethod\n    public void available(PluginCall call) {\n        String a = availability(); JSObject o = new JSObject(); o.put(\"ok\", \"ok\".equals(a)); o.put(\"reason\", a); call.resolve(o);\n    }\n";
const DISABLE_SRC = "    @PluginMethod\n    public void disable(PluginCall call) { wipeAll(); call.resolve(); }\n";
const WORK_SRC = "    private interface Work { JSObject run(Cipher c) throws Exception; }\n";
const PROMPTFN_SRC = "    private void prompt(final PluginCall call, final Cipher c, final Work work, final boolean wipeOnFail) {\n        final FragmentActivity act = getActivity();\n        if (act == null) { if (wipeOnFail) wipe(); call.reject(\"error\"); return; }\n        act.runOnUiThread(() -> {\n            try {\n                BiometricPrompt.PromptInfo.Builder pb = new BiometricPrompt.PromptInfo.Builder()\n                    .setTitle(call.getString(\"title\", \"Alien Notes\")).setNegativeButtonText(call.getString(\"negative\", \"Cancel\"))\n                    .setAllowedAuthenticators(AUTH).setConfirmationRequired(true);   // passive Biometrie (Gesicht) braucht einen bewussten Tipp; Fingerabdruck unberührt (Audit run-3 #2)\n                String sub = call.getString(\"subtitle\", \"\");\n                if (sub != null && !sub.isEmpty()) pb.setSubtitle(sub);\n                BiometricPrompt bp = new BiometricPrompt(act, ContextCompat.getMainExecutor(act), new BiometricPrompt.AuthenticationCallback() {\n                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {\n                        try {\n                            Cipher cc = r.getCryptoObject() != null ? r.getCryptoObject().getCipher() : null;\n                            if (cc == null) throw new IllegalStateException(\"nocrypto\");\n                            call.resolve(work.run(cc));\n                        } catch (javax.crypto.AEADBadTagException e) { call.reject(\"tampered\"); }   // Klartext-Feld (boot/keep) der Slot-Datei verändert: nie „vorübergehend“, kein automatisches Wipe (Audit run-8 #16)\n                        catch (Exception e) { if (wipeOnFail) wipe(); call.reject(\"error\"); }\n                    }\n                    @Override public void onAuthenticationError(int code, CharSequence msg) {\n                        if (wipeOnFail) wipe();\n                        boolean cancel = code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_CANCELED;\n                        boolean lockout = code == BiometricPrompt.ERROR_LOCKOUT || code == BiometricPrompt.ERROR_LOCKOUT_PERMANENT;\n                        call.reject(cancel ? \"cancel\" : lockout ? \"lockout\" : \"error\");\n                    }\n                    // onAuthenticationFailed: einzelner Fehlversuch — der Prompt bleibt offen, das System zählt und sperrt selbst\n                });\n                bp.authenticate(pb.build(), new BiometricPrompt.CryptoObject(c));\n            } catch (Exception e) { if (wipeOnFail) wipe(); call.reject(\"error\"); }\n        });\n    }\n";
const CM_SRC = "    private ClipboardManager cm() { return (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE); }\n";
// Runde 2 (Prüfer b B3): Gerüst jeder Java-Datei = was nach Entfernen ALLER wörtlichen Kopien übrig bleibt (package, imports, Kommentare, Klassenkopf,
// @PluginMethod-Zeilen, schließende Klammer) — gepinnt, damit kein zusätzliches Mitglied (Methode, innere Klasse, Initialisierer, Feld) unbemerkt dazukommt.
// WVMETH_SRC: zweite Kopie der Tastatur-Methode (die Prüfung im Tastatur-Abschnitt unten führt sie wörtlich im Text).
const WVMETH_SRC = "    @Override\n    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {\n        InputConnection ic = super.onCreateInputConnection(outAttrs);\n        outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;\n        return ic;\n    }\n";
const GERUEST_MAIN = "package org.alieninvestor.notes;\n\nimport android.content.Intent;\nimport android.os.Build;\nimport android.os.Bundle;\nimport android.view.View;\nimport android.view.WindowManager;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    // Gegenstück zum Hebel unten (v1.5, aus Alien Pass v1.15): Activity.restoreAutofillSaveUi() ruft getAutofillManager() OHNE Null-Prüfung,\n    // ausgelöst allein durch diese Intent-Extras (finish/onBackPressed/onStop/startActivity, Android 8.1+). Jede App könnte Alien Notes mit ihnen starten und\n    // beim Schließen abstürzen lassen (NullPointerException, ggf. mitten im Speichern) — deshalb vor super.onCreate/onNewIntent entfernen.\n\n\n\n    // Wirksame Schicht (Gerätetest Alien Pass v1.12/v1.13, GrapheneOS 26.09.2026): das Flag oben prüft Chromiums WebView-AutofillProvider\n    // nicht, und notifyViewEntered für virtuelle Views fragt isImportantForAutofill nicht ab — Proton Pass bot sich weiter an. Chromiums\n    // AutofillManagerWrapper holt den Manager per context.getSystemService(AutofillManager.class) über den WebView-Context (= diese\n    // Activity); liefert der null, ist isDisabled() true und alle notify*-Aufrufe sind No-ops. Context.AUTOFILL_MANAGER_SERVICE ist nicht\n    // öffentlich, darum das Literal \"autofill\" (API 26+).\n}\n";
const GERUEST_CLIP = "package org.alieninvestor.notes;\n\nimport android.content.ClipData;\nimport android.content.ClipDescription;\nimport android.content.ClipboardManager;\nimport android.content.Context;\nimport android.os.Build;\nimport android.os.PersistableBundle;\nimport com.getcapacitor.Plugin;\nimport com.getcapacitor.PluginCall;\nimport com.getcapacitor.PluginMethod;\nimport com.getcapacitor.annotation.CapacitorPlugin;\n\n/** Zwischenablage ohne System-Vorschau: EXTRA_IS_SENSITIVE (Android 13+) maskiert den Inhalt im Clipboard-Overlay.\n *  Kein Lesen der Zwischenablage, keine weiteren Berechtigungen. */\n@CapacitorPlugin(name = \"SecureClip\")\npublic class SecureClipPlugin extends Plugin {\n\n\n}\n";
const GERUEST_SEC = "package org.alieninvestor.notes;\n\nimport android.view.WindowManager;\nimport androidx.fragment.app.FragmentActivity;\nimport com.getcapacitor.Plugin;\nimport com.getcapacitor.PluginCall;\nimport com.getcapacitor.PluginMethod;\nimport com.getcapacitor.annotation.CapacitorPlugin;\n\n/** FLAG_SECURE (kein Screenshot, keine Vorschau im App-Umschalter) zur Laufzeit: set({on:true|false}).\n *  Keine Berechtigung, liest nichts. Der Sperrbildschirm ist immer geschützt — das JS ruft set(true) vor jeder Sperre. */\n@CapacitorPlugin(name = \"SecureScreen\")\npublic class SecureScreenPlugin extends Plugin {\n}\n";
const GERUEST_VS = "package org.alieninvestor.notes;\n\nimport com.getcapacitor.JSObject;\nimport com.getcapacitor.Plugin;\nimport com.getcapacitor.PluginCall;\nimport com.getcapacitor.PluginMethod;\nimport com.getcapacitor.annotation.CapacitorPlugin;\nimport java.io.File;\nimport java.io.FileInputStream;\nimport java.io.FileOutputStream;\nimport java.io.InputStream;\nimport java.nio.charset.StandardCharsets;\n\n/** Notizen-Datei im privaten App-Ordner: read() -> {data: string|null}, write({data}) -> {ok}, del() -> {ok}.\n *  Schreiben atomar (Temp-Datei, fsync, rename ueber die alte Datei), Groesse nach dem Schreiben geprueft — nie eine halbe Datei. */\n@CapacitorPlugin(name = \"VaultStore\")\npublic class VaultStorePlugin extends Plugin {\n\n\n\n\n}\n";
const GERUEST_BIO = "package org.alieninvestor.notes;\n\nimport android.content.pm.PackageManager;\nimport android.os.Build;\nimport android.os.SystemClock;\nimport android.provider.Settings;\nimport android.security.keystore.KeyGenParameterSpec;\nimport android.security.keystore.KeyPermanentlyInvalidatedException;\nimport android.security.keystore.KeyProperties;\nimport android.util.Base64;\nimport androidx.biometric.BiometricManager;\nimport androidx.biometric.BiometricPrompt;\nimport androidx.core.content.ContextCompat;\nimport androidx.fragment.app.FragmentActivity;\nimport com.getcapacitor.JSObject;\nimport com.getcapacitor.Plugin;\nimport com.getcapacitor.PluginCall;\nimport com.getcapacitor.PluginMethod;\nimport com.getcapacitor.annotation.CapacitorPlugin;\nimport java.io.BufferedReader;\nimport java.io.File;\nimport java.io.FileInputStream;\nimport java.io.FileOutputStream;\nimport java.io.FileReader;\nimport java.io.InputStreamReader;\nimport java.nio.charset.StandardCharsets;\nimport java.security.KeyStore;\nimport java.util.Arrays;\nimport javax.crypto.Cipher;\nimport javax.crypto.KeyGenerator;\nimport javax.crypto.SecretKey;\nimport javax.crypto.spec.GCMParameterSpec;\nimport org.json.JSONObject;\n\n/** Fingerabdruck-Slot: 32 Byte Zufall (vom JS erzeugt, dort als Wrap-Schlüssel für den DEK benutzt) liegen AES-GCM-verschlüsselt\n *  unter einem Android-Keystore-Schlüssel, der nur nach einem starken Fingerabdruck nutzbar ist (Freigabe pro Nutzung, ungültig bei\n *  neu eingerichtetem Fingerabdruck, StrongBox falls vorhanden; Bestätigung im Prompt verlangt, Fingerabdrucksensor vorausgesetzt).\n *  Die Boot-Kennung ist als GCM-AAD mitauthentisiert; nach einem Neustart meldet status() \"reboot\" und löscht Datei + Schlüssel.\n *  Ausnahme seit v1.8: Wurde der Slot mit keep=true angelegt (Kästchen beim Aktivieren, ab Werk aus), gilt er über den Neustart hinaus;\n *  dann lautet die AAD boot+\"|keep\" statt boot — die Wahl ist damit mitauthentisiert und nur durch Neu-Aktivieren änderbar.\n *  Liest keine fremden Daten, braucht nur USE_BIOMETRIC (+ USE_FINGERPRINT bis API 27).\n *  Fehlercodes an JS: cancel | lockout | reboot | invalidated | tampered | none | unavailable | error. */\n@CapacitorPlugin(name = \"Biometric\")\npublic class BiometricPlugin extends Plugin {\n\n\n    /** Boot-Kennung, immer in der GCM-AAD des Slots (Audit run-8 #4): zuerst Settings.Global.BOOT_COUNT (API 24+, keine Berechtigung,\n     *  monoton, unabhängig von /proc und von der Uhr) als \"b:<n>\", ersatzweise /proc boot_id (\"id:\"), zuletzt die Boot-Zeit in Sekunden\n     *  (\"t:\", Toleranz beim Vergleich). Slots von v1.7 tragen \"id:\"/\"t:\" und melden nach dem Update einmal reboot → Neu-Bewaffnung nach der Passphrase. */\n\n    /** Slot UND Kanarie verwerfen: bewusstes Deaktivieren, ungültige Registrierung. */\n    /** ok | invalidated (seit dem Anlegen wurde ein Fingerabdruck registriert) | missing | error (Keystore vorübergehend) */\n\n\n\n\n    /** enabled = Slot vorhanden, gleicher Boot (oder keep gesetzt), Schlüssel gültig. reason: ok | none | reboot | invalidated | unavailable;\n     *  bei enabled zusätzlich keep = gilt der Slot über einen Neustart hinaus (nur zur Anzeige im JS).\n     *  Neustart löscht Datei + Schlüssel SOFORT (Audit run-3 #6; das JS merkt sich nur einen Marker und bewaffnet nach der Passphrase neu);\n     *  ein ungültiger Schlüssel (neuer Fingerabdruck) wird gelöscht; ein vorübergehender Keystore-Fehler löscht NICHT (unavailable). */\n    @PluginMethod\n\n\n    /** Frischen Keystore-Schlüssel anlegen, Fingerabdruck abfragen, Zufall verschlüsselt ablegen. Alter Slot wird vorher verworfen. */\n    @PluginMethod\n\n    /** Fingerabdruck abfragen, Zufall entschlüsselt zurückgeben (JS packt damit den DEK aus und nullt die Bytes). */\n    @PluginMethod\n\n    /** Boot-Kennung (+ keep) als GCM-AAD, IMMER — auch die Zeit-Rückfallform: unlock() nimmt den GESPEICHERTEN Wert, die Toleranz gilt nur\n     *  in sameBoot, darum bricht die AAD nie an der Abweichung. Ohne AAD wäre keep im Klartext frei setzbar (Audit run-8 #4). */\n\n}\n";
const GERUEST_WV = "package org.alieninvestor.notes;\n\nimport android.content.Context;\nimport android.util.AttributeSet;\nimport android.view.inputmethod.EditorInfo;\nimport android.view.inputmethod.InputConnection;\nimport com.getcapacitor.CapacitorWebView;\n\n// Alien Notes (v1.13): bittet die Tastatur-App, aus keinem Feld der App zu lernen (patch-hardening.mjs, Abschnitt 5).\npublic class NoLearnWebView extends CapacitorWebView {\n\n    public NoLearnWebView(Context context, AttributeSet attrs) {\n        super(context, attrs);\n    }\n\n}\n";
{
  const bad = [], cnt = (t, re) => (t.match(re) || []).length, all = [jm, jc, jb, js, jv, jwr], jmc = noComments(jm), jsc = noComments(js);
  // Zeichenketteninhalt weg (auf dem Text ohne Kommentare): dort zählt nur noch Code — `String a = "aad(cipher, ad);";` erfüllte sonst die Zählung (Pass d-4)
  const noStr = (t) => t.replace(/"(?:[^"\\\n]|\\.)*"/g, '""'), jbs = noStr(jbc);
  // d-5: rohes CR (javac: Zeilenende, noComments nicht) und Reflection (javac faltet "clear" + "Flags" zur Konstante, kein Methodenverweis im Bytecode)
  if (all.some((t) => t.includes('\r'))) bad.push('rohes CR');
  if (all.some((t) => /\bget(Declared)?(Method|Field|Constructor)s?\s*\(|\bforName\s*\(|java\.lang\.(reflect|invoke)|MethodHandle/.test(t))) bad.push('Reflection');
  // d-3: genau die sechs Java-Dateien unter src/main/java (rekursiv, ein Symlink zählt als Datei), keine weitere .java/.kt unter src/main
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]));
  const want = [MAIN, CLIP, BIO, SEC, VS, WV].sort().join('\n');
  if (walk('android/app/src/main/java').sort().join('\n') !== want || walk('android/app/src/main').filter((f) => /\.(java|kts?)$/.test(f)).sort().join('\n') !== want) bad.push('Java-Dateien');
  // d-3: Plugins nur über die vier registerPlugin in onCreate (ONCREATE_SRC) — kein registerPluginInstance/registerPlugins/addPlugin*, keine fünfte Plugin-Klasse
  if (cnt(jm, /registerPlugin\w*\s*\(/g) !== 4 || [jc, jb, js, jv, jwr].some((t) => /registerPlugin\w*\s*\(/.test(t)) || all.some((t) => /addPlugin|NativePlugin|PluginHandle/.test(t))) bad.push('Plugin-Registrierung');
  if ([jc, jb, js, jv].some((t) => cnt(t, /@CapacitorPlugin\b/g) !== 1 || cnt(t, /\bextends\s+Plugin\b/g) !== 1) || /@CapacitorPlugin\b|\bextends\s+Plugin\b/.test(jm + jwr)) bad.push('Plugin-Klassen');
  // d-6: Plugin-Name und Klassenkopf wörtlich (app.js sucht CAP.Plugins.SecureClip/Biometric/SecureScreen/VaultStore), @PluginMethod genau an write/clear,
  // den fünf Biometric-Methoden, set bzw. read/write/del
  if (!jc.includes(CLIPHEAD_SRC) || !jb.includes(BIOHEAD_SRC) || !js.includes(SECHEAD_SRC) || !jv.includes(VSHEAD_SRC)) bad.push('Plugin-Name');
  const pm = (t, names) => [t, noComments(t)].every((x) => cnt(x, /@PluginMethod\b/g) === names.length) && names.every((n) => t.includes('    @PluginMethod\n    public void ' + n + '(PluginCall call) {'));
  if (!pm(jc, ['write', 'clear']) || !pm(jb, ['available', 'status', 'disable', 'enroll', 'unlock']) || !pm(js, ['set']) || !pm(jv, ['read', 'write', 'del'])
      || /@PluginMethod\b/.test(jm + jwr)) bad.push('@PluginMethod');
  // d-1: Autofill-Hebel getSystemService und onNewIntent wörtlich, je genau eine Methode; d-2: setImportantForAutofill( genau einmal (eine Rücknahme in
  // onResume blieb sonst grün), genau drei @Override (getSystemService, onNewIntent, onCreate)
  if (!jm.includes(GETSYS_SRC) || [jm, jmc].some((t) => cnt(t, /\bgetSystemService\s*\(\s*String\b/g) !== 1)) bad.push('getSystemService');
  if (!jm.includes(NEWINTENT_SRC) || [jm, jmc].some((t) => cnt(t, /\bvoid\s+onNewIntent\s*\(/g) !== 1)) bad.push('onNewIntent');
  if ([jm, jmc].some((t) => cnt(t, /setImportantForAutofill\s*\(/g) !== 1 || cnt(t, /@Override\b/g) !== 3)) bad.push('Autofill/Override');
  // Pass v1.23 Runde 1 (run-13 B1/B3/B6): onCreate, dropAutofillRestore, write und set je genau einmal — roh UND ohne Kommentare, auch `protected`/mit Leerzeichen
  // (Notes zählte bisher `public void onCreate(` bzw. `void dropAutofillRestore(` nur roh)
  if ([jm, jmc].some((t) => cnt(t, /\bvoid\s+onCreate\s*\(/g) !== 1 || cnt(t, /\bvoid\s+dropAutofillRestore\s*\(/g) !== 1)
      || [jc, jcc].some((t) => cnt(t, /\bvoid\s+write\s*\(/g) !== 1) || [js, jsc].some((t) => cnt(t, /\bvoid\s+set\s*\(/g) !== 1)) bad.push('Methoden je genau einmal');
  // d-4: Neustart-Regel — bootTag, sameBoot und aad wörtlich, je genau eine Methode; die Code-Zählungen zusätzlich ohne Zeichenketteninhalt
  if (!jb.includes(BOOTTAG_SRC) || !jb.includes(SAMEBOOT_SRC) || !jb.includes(AAD_SRC)
      || [jb, jbc].some((t) => cnt(t, /\bString\s+bootTag\s*\(/g) !== 1 || cnt(t, /\bboolean\s+sameBoot\s*\(/g) !== 1 || cnt(t, /\bvoid\s+aad\s*\(/g) !== 1)) bad.push('Neustart-Regel');
  if (cnt(jbs, /\baad\(cipher, ad\);/g) !== 2 || cnt(jbs, /!keep && !sameBoot\(/g) !== 2 || cnt(jbs, /\bsameBoot\(/g) !== 3 || cnt(jbs, /\bbootTag\(\)/g) !== 3
      || cnt(jbs, /optBoolean\("", false\)/g) !== 2 || cnt(jbs, /\bboot \+ ""/g) !== 2 || !jbs.includes('c.updateAAD(boot.getBytes(') || !jbs.includes('Settings.Global.BOOT_COUNT')
      || !['setUserAuthenticationRequired(true)', 'setInvalidatedByBiometricEnrollment(true)', 'setConfirmationRequired(true)', 'BIOMETRIC_STRONG', 'FEATURE_FINGERPRINT', 'canaryState()'].every((s) => jbs.includes(s)))
    bad.push('Neustart-Regel/AAD ohne Zeichenketten');
  // r2d-1: status/enroll/unlock wörtlich und je genau einmal — roh als void-Methode (eine Kopie im Kommentar über einer geänderten Methode zählte sonst mit) und
  // ohne Kommentare/Zeichenketten jeder Name genau einmal (keine Überladung, kein zweiter Aufrufweg)
  if (!jb.includes(STATUS_SRC) || !jb.includes(ENROLL_SRC) || !jb.includes(UNLOCK_SRC)
      || ['status', 'enroll', 'unlock'].some((n) => cnt(jb, new RegExp('\\bvoid\\s+' + n + '\\s*\\(', 'g')) !== 1 || cnt(jbs, new RegExp('\\b' + n + '\\s*\\(', 'g')) !== 1))
    bad.push('Neustart-/Kanarien-Auswertung (status/enroll/unlock)');
  // nb-1: canaryState wörtlich und genau einmal — roh UND ohne Kommentare genau eine `String canaryState(`, ohne Kommentare/Zeichenketten `canaryState(` genau 5×
  // (die Methode + die vier Aufrufe in STATUS_SRC/ENROLL_SRC/UNLOCK_SRC: keine Überladung, kein zweiter Weg); wipe/wipeAll/deleteKey wörtlich, je genau eine Methode
  if (!jb.includes(CANARY_SRC) || [jb, jbc].some((t) => cnt(t, /\bString\s+canaryState\s*\(/g) !== 1) || cnt(jbs, /\bcanaryState\s*\(/g) !== 5)
    bad.push('Kanarie (canaryState)');
  if (!jb.includes(WIPE_SRC) || !jb.includes(WIPEALL_SRC) || !jb.includes(DELKEY_SRC)
      || ['wipe', 'wipeAll', 'deleteKey'].some((n) => [jb, jbc].some((t) => cnt(t, new RegExp('\\bvoid\\s+' + n + '\\s*\\(', 'g')) !== 1)))
    bad.push('Slot/Kanarie verwerfen (wipe/wipeAll/deleteKey)');
  // F1 (Prüfer b): die Zweitkopien oben wörtlich, die Kopfzeile je genau einmal roh UND ohne Kommentare (eine Kopie in /* … */ über einer geänderten Methode
  // zählte sonst mit; eine umbenannte Methode ließe die Kopie im Kommentar stehen)
  for (const [k, t, src, kopf] of [
      ["VSMAX_SRC", jv, VSMAX_SRC, "    private static final long MAX = "],
      ["VSDIR_SRC", jv, VSDIR_SRC, "    private File dir() {"],
      ["VSFILE_SRC", jv, VSFILE_SRC, "    private File file() {"],
      ["VSTMP_SRC", jv, VSTMP_SRC, "    private File tmp() {"],
      ["VSREAD_SRC", jv, VSREAD_SRC, "    public void read(PluginCall call) {"],
      ["VSWRITE_SRC", jv, VSWRITE_SRC, "    public void write(PluginCall call) {"],
      ["VSDEL_SRC", jv, VSDEL_SRC, "    public void del(PluginCall call) {"],
      ["BIOKONST_SRC", jb, BIOKONST_SRC, "    private static final String ALIAS = "],
      ["BIOFILE_SRC", jb, BIOFILE_SRC, "    private File file() {"],
      ["READSTATE_SRC", jb, READSTATE_SRC, "    private JSONObject readState() {"],
      ["WRITESTATE_SRC", jb, WRITESTATE_SRC, "    private void writeState(JSONObject o) throws Exception {"],
      ["AVAIL_SRC", jb, AVAIL_SRC, "    private String availability() {"],
      ["CREATEKEY0_SRC", jb, CREATEKEY0_SRC, "    private void createKey() throws Exception {"],
      ["CIPHERFOR_SRC", jb, CIPHERFOR_SRC, "    private Cipher cipherFor(int mode, byte[] iv) throws Exception {"],
      ["AVAILABLE_SRC", jb, AVAILABLE_SRC, "    public void available(PluginCall call) {"],
      ["DISABLE_SRC", jb, DISABLE_SRC, "    public void disable(PluginCall call) {"],
      ["WORK_SRC", jb, WORK_SRC, "    private interface Work {"],
      ["PROMPTFN_SRC", jb, PROMPTFN_SRC, "    private void prompt(final PluginCall call, final Cipher c, final Work work, final boolean wipeOnFail) {"],
      ["CM_SRC", jc, CM_SRC, "    private ClipboardManager cm() {"]]) {
    if (!t.includes(src) || [t, noComments(t)].some((x) => x.split(kopf).length !== 2)) bad.push('wörtlich ' + k.replace(/_SRC$/, ''));
  }
  // F2 (Prüfer b): Quellen NUR die sechs Notes-Dateien — in ALLEN Quellordnern von app (src/<beliebig>, nicht nur src/main), in app/libs und im Modul
  // capacitor-cordova-android-plugins (ohne dessen build/): kein weiteres .java/.kt/.jar/.aar/.so/.dex/.class/.aidl/C-Quelle, keine Symlinks (Gradle folgt ihnen,
  // walk sähe nur einen Namen). Eine Hilfsklasse com.x.Hilfe unter src/release/java (baut AGP für assembleRelease mit) oder eine .so unter src/main/jniLibs blieb
  // vorher grün (Mutanten fremdpaket, bio-jni). build-apk.sh entfernt Capacitors Beispiel-Tests (src/test, src/androidTest) nach cap add. Gegenstück am Bytecode:
  // Klassenliste, Erlaubnislisten über alle Klassen und APK-Einträge in build-apk.sh.
  { const lauf = (d, aus = []) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => { const p = d + '/' + e.name;
        if (aus.includes(p)) return []; if (e.isSymbolicLink()) return [p + ' (Symlink)']; return e.isDirectory() ? lauf(p, aus) : [p]; }) : []);
    const code = /\.(java|kt|kts|jar|aar|so|dex|class|aidl|c|cc|cpp)$|\(Symlink\)$/, sechs = [MAIN, CLIP, BIO, SEC, VS, WV];
    const ist = [...lauf('android/app/src'), ...lauf('android/app/libs'), ...lauf('android/capacitor-cordova-android-plugins', ['android/capacitor-cordova-android-plugins/build'])].filter((f) => code.test(f));
    if (ist.sort().join('\n') !== [...sechs].sort().join('\n')) bad.push('Quellen außerhalb der sechs Java-Dateien: ' + (ist.filter((f) => !sechs.includes(f)).slice(0, 3).join(', ') || 'eine fehlt')); }
  // B3 (Runde 2, Prüfer b): GANZE Dateien gebunden — nach Entfernen aller wörtlichen Kopien (je genau einmal) muss der Rest jeder Java-Datei genau dem
  // gepinnten Gerüst entsprechen. Vorher bestanden zusätzliche Mitglieder die Java-Schicht: ein @Override load(), das die Notizen-Datei in den externen
  // Speicher kopiert, eine wörtliche Attrappe von dir() in einer inneren Klasse neben einer geänderten dir(), ein Instanz-Initialisierer (Prüfer-Mutanten J1–J3).
  const geruest = (t, snips) => { let r = t; for (const x of snips) { if (r.split(x).length !== 2) return null; r = r.replace(x, () => ''); } return r; };
  for (const [d, t, snips, g] of [
      ['MainActivity', jm, [ONCREATE_SRC, GETSYS_SRC, NEWINTENT_SRC, DROP_SRC], GERUEST_MAIN],
      ['SecureClipPlugin', jc, [CLIPWRITE_SRC, CLEAR_SRC, CM_SRC], GERUEST_CLIP],
      ['SecureScreenPlugin', js, [SET_SRC], GERUEST_SEC],
      ['VaultStorePlugin', jv, [VSMAX_SRC, VSDIR_SRC, VSFILE_SRC, VSTMP_SRC, VSREAD_SRC, VSWRITE_SRC, VSDEL_SRC], GERUEST_VS],
      ['BiometricPlugin', jb, [BIOKONST_SRC, BIOFILE_SRC, BOOTTAG_SRC, SAMEBOOT_SRC, READSTATE_SRC, WRITESTATE_SRC, WIPE_SRC, WIPEALL_SRC, DELKEY_SRC, CANARY_SRC, AVAIL_SRC,
        CREATEKEY0_SRC, CREATEKEY_SRC, CIPHERFOR_SRC, AVAILABLE_SRC, STATUS_SRC, DISABLE_SRC, ENROLL_SRC, UNLOCK_SRC, AAD_SRC, WORK_SRC, PROMPTFN_SRC], GERUEST_BIO],
      ['NoLearnWebView', jwr, [WVMETH_SRC], GERUEST_WV]]) {
    if (geruest(t, snips) !== g) bad.push('Gerüst ' + d + ' (zusätzliches Mitglied oder geänderter Rest)');
  }
  if (bad.length) { console.error('FEHLER: Java-Härtung unvollständig (' + bad.join(', ') + ') — Build abgebrochen!'); process.exit(1); }
}

// Tastatur-Bitte (v1.13): Reihenfolge und Form gepinnt — das ODER muss NACH super stehen (vorher gesetzt überschriebe Chromium es), darf nicht zur
// Zuweisung werden (löschte die Optionen des Feldes) und nicht auskommentiert sein; das Layout muss die eigene Klasse unter der ID webview tragen.
// Dazu Wächter gegen ein Capacitor-Update: ändert sich Layout-Name, ID, setContentView oder die Signatur, fiele die Bitte sonst STILL weg.
{
  const jw = readFileSync(WV, 'utf8'), lw = readFileSync(LAYOUT, 'utf8');
  const CAP_SRC = 'node_modules/@capacitor/android/capacitor/src/main';
  const capRead = (f) => { try { return readFileSync(CAP_SRC + '/' + f, 'utf8'); } catch (_) { return ''; } };
  const capLayout = capRead('res/layout/bridge_layout_main.xml'), capAct = capRead('java/com/getcapacitor/BridgeActivity.java');
  const capBridge = capRead('java/com/getcapacitor/Bridge.java'), capWv = capRead('java/com/getcapacitor/CapacitorWebView.java');
  const iSuper = jw.indexOf('InputConnection ic = super.onCreateInputConnection(outAttrs);'), iOr = jw.indexOf('outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;');
  const bad = [];
  if (!jw.includes('public class NoLearnWebView extends CapacitorWebView {')) bad.push('Klasse');
  if (!jw.includes('public NoLearnWebView(Context context, AttributeSet attrs) {\n        super(context, attrs);')) bad.push('Konstruktor');
  if (iSuper < 0 || iOr < 0 || iOr < iSuper) bad.push('ODER nicht nach super');
  if (!/outAttrs\.imeOptions \|= EditorInfo\.IME_FLAG_NO_PERSONALIZED_LEARNING;\n        return ic;/.test(jw)) bad.push('return ic');
  // ganzer Methodenrumpf wörtlich (Release-Audit v1.13 b: eine Bedingung vor dem ODER kam sonst durch) und genau eine solche Methode
  if (!jw.includes('    @Override\n    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {\n        InputConnection ic = super.onCreateInputConnection(outAttrs);\n        outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;\n        return ic;\n    }\n')
      || (jw.match(/onCreateInputConnection\(/g) || []).length !== 2 || /\b(if|else|switch|try|for|while|return null)\b/.test(jw.replace(/\/\/[^\n]*/g, ''))) bad.push('Methodenrumpf');
  if (/imeOptions\s*=[^=]/.test(jw) || /\/\*/.test(jw) || /\/\/[^\n]*(imeOptions|onCreateInputConnection|return ic)/.test(jw)) bad.push('Zuweisung oder auskommentiert');
  if ((jw.match(/imeOptions/g) || []).length !== 1) bad.push('imeOptions mehrfach');
  const lwCode = lw.replace(/<!--[\s\S]*?-->/g, '');   // nur Markup außerhalb von Kommentaren zählt
  if (!lwCode.includes('<org.alieninvestor.notes.NoLearnWebView\n        android:id="@+id/webview"') || /CapacitorWebView/.test(lwCode) || (lwCode.match(/[\w-]+:id\s*=/g) || []).length !== 1 || (lwCode.match(/<[A-Za-z]/g) || []).length !== 2) bad.push('Layout');
  if (!capLayout.includes('<com.getcapacitor.CapacitorWebView\n        android:id="@+id/webview"')) bad.push('Capacitor: Bibliotheks-Layout geändert');
  if (!capAct.includes('setContentView(R.layout.bridge_layout_main);')) bad.push('Capacitor: setContentView geändert');
  if (!capBridge.includes('findViewById(R.id.webview)') || !capBridge.includes('webView instanceof CapacitorWebView')) bad.push('Capacitor: Bridge sucht die WebView anders');
  if (!capWv.includes('public InputConnection onCreateInputConnection(EditorInfo outAttrs) {') || !capWv.includes('public CapacitorWebView(Context context, AttributeSet attrs) {')) bad.push('Capacitor: CapacitorWebView geändert');
  // captureInput: CapacitorWebView gäbe eine leere BaseInputConnection (TYPE_NULL) zurück und reichte Tastaturtext per evaluateJavascript weiter — nie setzen.
  // Geprüft wird die von `cap sync` ERZEUGTE Konfiguration im Asset (die CLI liest .ts/.js VOR .json; Release-Audit v1.13 b2), dazu keine .ts/.js-Konfiguration.
  // Seit v1.15 GENAUE Schlüsselmenge statt nur captureInput (Querfund Pass v1.23 run-13 r2d-2, wortgleich Pass bis auf die App-ID): android.webContentsDebuggingEnabled
  // (chrome://inspect über adb, alle Notizen lesbar) und loggingBehavior "production" (Capacitor schreibt die Daten jedes Plugin-Aufrufs nach logcat, auch das
  // Geheimnis aus enroll und den Inhalt jedes VaultStore.write) liefen sonst durch; ebenso server.url, plugins, useLegacyBridge … (Capacitor 6.2.2 CapConfig).
  // Erlaubt: appId/appName/webDir/android.allowMixedContent=false wie heute, dazu nur loggingBehavior bzw. android.loggingBehavior = "none" und
  // android.webContentsDebuggingEnabled = false (Release-Default: beide aus, weil nicht debuggable). Wortgleich an der fertigen APK in build-apk.sh (jq).
  { let cfg = null; try { cfg = JSON.parse(readFileSync('android/app/src/main/assets/capacitor.config.json', 'utf8')); } catch (_) { cfg = null; }
    const obj = (o) => !!o && typeof o === 'object' && !Array.isArray(o), nur = (o, ks) => Object.keys(o).every((k) => ks.includes(k));
    const cfgOk = obj(cfg) && obj(cfg.android) && nur(cfg, ['appId', 'appName', 'webDir', 'android', 'loggingBehavior'])
      && nur(cfg.android, ['allowMixedContent', 'webContentsDebuggingEnabled', 'loggingBehavior']) && cfg.appId === 'org.alieninvestor.notes' && cfg.webDir === 'www'
      && typeof cfg.appName === 'string' && cfg.appName !== '' && cfg.android.allowMixedContent === false
      && (!('webContentsDebuggingEnabled' in cfg.android) || cfg.android.webContentsDebuggingEnabled === false)
      && [cfg, cfg.android].every((o) => !('loggingBehavior' in o) || o.loggingBehavior === 'none');
    if (!cfgOk || (cfg.android && 'captureInput' in cfg.android) || 'captureInput' in cfg || existsSync('capacitor.config.ts') || existsSync('capacitor.config.js')) bad.push('Konfiguration: captureInput/Schlüsselmenge'); }
  // Java ohne Kommentare und ohne Unicode-Escapes (javac löst \uXXXX VOR dem Parsen auf — ein \u000a beendete sonst einen Kommentar), genau eine Klasse
  { const code = jw.replace(/\/\/[^\n]*/g, '');
    if (/\\u+[0-9a-fA-F]{4}/.test(jw) || (code.match(/\bclass\b/g) || []).length !== 1 || !code.includes('public class NoLearnWebView extends CapacitorWebView {')
        || !code.includes('outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;') || /\bEditorInfo\s+[A-Za-z_]\w*\s*[=;]|\bint\s+EditorInfo\b/.test(code)) bad.push('Java-Form'); }
  if (bad.length) { console.error('FEHLER: Tastatur-Bitte unvollständig (' + bad.join(', ') + ') — Build abgebrochen!'); process.exit(1); }
  console.log('Tastatur-Bitte (NoLearnWebView + Layout) geprüft.');
}

// 8) @capacitor/share ohne exportierten Receiver und ohne Rückruf (v1.15, Querfund Alien Fitness v2.9 Audit run-2 A1 über Alien Pass v1.24; in Notes an der
//    ausgelieferten v1.14-APK gemessen, run-13 TABELLE F-A1): load() registriert beim App-Start einen EXPORTIERTEN Broadcast-Receiver (Aktion
//    android.intent.extra.CHOSEN_COMPONENT, onReceive ohne Fehlerbehandlung) — jede andere App auf dem Gerät hätte Alien Notes damit abstürzen lassen
//    können (laut Android-Quelltext, am Gerät nicht ausgelöst); der Rückruf (implizite, veränderbare PendingIntent im Teilen-Dialog) konnte außerdem
//    anderen Apps das gewählte Teilen-Ziel verraten. app.js liest das Ergebnis (activityType) nie (Backup und „Als Datei“ teilen nur). Darum fliegen Receiver
//    und Rückruf raus: der Teilen-Dialog startet ohne IntentSender, Share.share() hängt weiter am Activity-Ergebnis, handleOnDestroy prüft
//    broadcastReceiver != null. Upstream bis 8.0.3 weiter exportiert (8.0.3 prüft im Receiver nur eine Nonce, der Absturzweg bleibt).
//    Exakter Textersatz in node_modules (Gradle baut das Plugin direkt von dort, im Abbild frisch aus npm ci); passen Version oder Text nicht, bricht der
//    Build ab statt still ungepatcht zu bauen. Idempotent. Ersatztexte wortgleich Alien Fitness `apk/patch-hardening.mjs` (nur die Marke unterscheidet sich).
//    Beweis am Bytecode der FERTIGEN APK: `share_ok` in build-apk.sh.
{
  const SHARE_DIR = 'node_modules/@capacitor/share';
  const SHARE_SRC = `${SHARE_DIR}/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java`;
  const SHARE_MARK = '// alien-notes: Receiver und Rueckruf entfernt (patch-hardening.mjs, Querfund Alien Fitness v2.9 A1)';
  const shareVer = JSON.parse(readFileSync(`${SHARE_DIR}/package.json`, 'utf8')).version;
  if (shareVer !== '6.0.4') {
    console.error(`FEHLER: @capacitor/share ist ${shareVer}, der Patch kennt nur 6.0.4 — erst Review (Skill app-release, Schritt 0)!`);
    process.exit(1);
  }
  let sp = readFileSync(SHARE_SRC, 'utf8');
  if (!sp.includes(SHARE_MARK)) {
    const LOAD_OLD = `    @Override
    public void load() {
        broadcastReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        chosenComponent = intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT, ComponentName.class);
                    } else {
                        chosenComponent = getParcelableExtraLegacy(intent, Intent.EXTRA_CHOSEN_COMPONENT);
                    }
                }
            };
        ContextCompat.registerReceiver(
            getContext(),
            broadcastReceiver,
            new IntentFilter(Intent.EXTRA_CHOSEN_COMPONENT),
            ContextCompat.RECEIVER_EXPORTED
        );
    }
`;
    const LOAD_NEW = `    ${SHARE_MARK}
    @Override
    public void load() {}
`;
    const PI_OLD = `            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flags = flags | PendingIntent.FLAG_MUTABLE;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                flags = flags | PendingIntent.FLAG_ALLOW_UNSAFE_IMPLICIT_INTENT;
            }

            // requestCode parameter is not used. Providing 0
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), 0, new Intent(Intent.EXTRA_CHOSEN_COMPONENT), flags);
            Intent chooser = Intent.createChooser(intent, dialogTitle, pi.getIntentSender());
`;
    const PI_NEW = `            Intent chooser = Intent.createChooser(intent, dialogTitle);
`;
    if (sp.split(LOAD_OLD).length !== 2 || sp.split(PI_OLD).length !== 2) {
      console.error(`FEHLER: ${SHARE_SRC} passt nicht zum erwarteten 6.0.4-Text — Patch nicht anwendbar, Build abgebrochen!`);
      process.exit(1);
    }
    sp = sp.replace(LOAD_OLD, LOAD_NEW).replace(PI_OLD, PI_NEW);
    writeFileSync(SHARE_SRC, sp);
    console.log('Share-Plugin gepatcht (kein exportierter Receiver, kein Rückruf).');
  } else console.log('Share-Plugin bereits gepatcht.');
  // Immer prüfen, auch auf dem „bereits gepatcht“-Weg (eine Marke allein beweist nichts). \b: unregisterReceiver (Aufräumen, mit Null-Prüfung) bleibt erlaubt.
  sp = readFileSync(SHARE_SRC, 'utf8');
  // seit den Diff-Reviews (08.11.2026): jede PendingIntent-Fabrik, createPendingResult, ChooserAction, ResultReceiver, CHOOSER_-Extras, die
  // CHOSEN_COMPONENT-Zeichenkette in jeder Form und Reflection ebenfalls verboten. Vorprüfung am Text — der Beweis ist share_ok am Bytecode (build-apk.sh).
  if (/\bregisterReceiver|RECEIVER_EXPORTED|PendingIntent\.[A-Za-z]+\(|getIntentSender|createPendingResult|ChooserAction|ResultReceiver|\.getMethod\(|Class\.forName|CHOSEN_COMPONENT|CHOOSER_|getDeclared(Method|Constructor|Field)|getConstructor|java\.lang\.(reflect|invoke)|MethodHandle|\\u+[0-9a-fA-F]{4}/.test(sp)
      || (sp.match(/Intent\.createChooser\(/g) || []).length !== 1 || !sp.includes('            Intent chooser = Intent.createChooser(intent, dialogTitle);\n')
      || (sp.match(/public void load\(\)/g) || []).length !== 1 || !sp.includes('    @Override\n    public void load() {}\n')) {
    console.error('FEHLER: Share-Plugin enthält nach dem Patch noch Receiver/Rückruf (oder abweichende Form) — Build abgebrochen!');
    process.exit(1);
  }
}
