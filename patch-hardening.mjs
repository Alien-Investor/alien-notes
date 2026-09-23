// Injiziert die Android-Härtung idempotent in das (regenerierbare) android/-Projekt.
// Läuft in build-apk.sh nach `npx cap sync` — überlebt damit auch ein frisches `npx cap add android`.
//   Alien Notes (aus Alien Pass v1.8 übernommen; neu: SecureScreenPlugin für den FLAG_SECURE-Schalter).
//   1) AndroidManifest: allowBackup=false (keine ADB-/Cloud-Backups der Tresor-Daten)
//   2) AndroidManifest: INTERNET-Permission ENTFERNEN (App kann nachweisbar nicht funken)
//   3) MainActivity: FLAG_SECURE (kein Screenshot/Recording, keine Recents-Vorschau)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

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

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureClipPlugin.class);
        registerPlugin(BiometricPlugin.class);
        registerPlugin(SecureScreenPlugin.class);
        super.onCreate(savedInstanceState);
        // Kein Screenshot/Screen-Recording, keine Vorschau im App-Switcher (Recents) — ab Werk und auf dem Sperrbildschirm IMMER;
        // eine entsperrte Sitzung darf die Flagge über SecureScreenPlugin.set(false) aufheben (Einstellung, Entscheidung 24.09.2026)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
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
let changed = false;
for (const [file, src, label] of [[MAIN, MAIN_SRC, 'MainActivity (FLAG_SECURE + Plugin-Registrierung)'], [CLIP, CLIP_SRC, 'SecureClipPlugin'], [BIO, BIO_SRC, 'BiometricPlugin'], [SEC, SEC_SRC, 'SecureScreenPlugin']]) {
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (cur !== src) { writeFileSync(file, src); changed = true; console.log(label + ': geschrieben.'); }
}
if (!changed) console.log('MainActivity + SecureClipPlugin + BiometricPlugin + SecureScreenPlugin bereits aktuell.');
const jm = readFileSync(MAIN, 'utf8'), jb = readFileSync(BIO, 'utf8');
const js = readFileSync(SEC, 'utf8');
if (!jm.includes('getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE)') || !jm.includes('registerPlugin(SecureClipPlugin.class)') || !jm.includes('registerPlugin(BiometricPlugin.class)') || !jm.includes('registerPlugin(SecureScreenPlugin.class)')
  // SecureScreen: beide Richtungen vorhanden, Default AN, kein anderer Weg als set()
  || !js.includes('addFlags(WindowManager.LayoutParams.FLAG_SECURE)') || !js.includes('clearFlags(WindowManager.LayoutParams.FLAG_SECURE)') || !js.includes('call.getBoolean("on", true)') || (js.match(/@PluginMethod/g) || []).length !== 1
  || !readFileSync(CLIP, 'utf8').includes('EXTRA_IS_SENSITIVE')
  || !jb.includes('setUserAuthenticationRequired(true)') || !jb.includes('setInvalidatedByBiometricEnrollment(true)') || !jb.includes('BIOMETRIC_STRONG') || !jb.includes('sameBoot(')
  || !jb.includes('setConfirmationRequired(true)') || !jb.includes('FEATURE_FINGERPRINT')
  // AAD wirklich ANGEWENDET (der private Helfer allein genügt nicht — Audit run-8 #5): beide Aufrufe in enroll() und unlock() zählen
  || (jb.match(/aad\(cipher, ad\);/g) || []).length !== 2 || !jb.includes('c.updateAAD(boot.getBytes(') || !jb.includes('Settings.Global.BOOT_COUNT')
  || !jb.includes('canaryState()') || !/if \("invalidated"\.equals\(canaryState\(\)\)\) \{ wipeAll\(\); o\.put/.test(jb) || (jb.match(/"invalidated"\.equals\(canaryState\(\)\)/g) || []).length !== 2
  || !jb.includes('call.getBoolean("rearm", false)') || !jb.includes('"nocanary"')
  // v1.8 „Fingerabdruck auch nach Neustart“: die Wahl kommt vom JS, steht im Slot und hängt in der AAD; der Neustart-Zweig gilt nur
  // ohne keep — und zwar in status() UND unlock(), darum beide Vorkommen zählen; Default false und der Rearm-Riegel sind gepinnt (run-8 #5)
  || !jb.includes('call.getBoolean("keep", false)) && !rearm') || (jb.match(/boot \+ "\|keep"/g) || []).length !== 2 || !jb.includes('st.put("keep", true)')
  || (jb.match(/optBoolean\("keep", false\)/g) || []).length !== 2
  || (jb.match(/!keep && !sameBoot\(/g) || []).length !== 2 || !jb.includes('AEADBadTagException e) { call.reject("tampered")')
  // sameBoot: nur wenn BEIDE Kennungen die Zeit-Form haben, gilt die Toleranz — fiele die Zeile auf die alte id:-Form zurück, liefe b:5 gegen b:6
  // per parseLong in die ±120-s-Toleranz und die Neustart-Regel wäre still aus (Tresor-Diff-Review v3.2 N1)
  || !jb.includes('if (!stored.startsWith("t:") || !now.startsWith("t:")) return stored.equals(now);')
  // Kanarie VOR dem keep-/Boot-Zweig, in status() UND unlock(): bei einem keep-Slot hängt die Warnung „neuer Finger“ allein daran (Tresor-Diff-Review v3.2 H1)
  || !(() => { const before = (from) => { const c = jb.indexOf('"invalidated".equals(canaryState())', from), k = jb.indexOf('!keep && !sameBoot(', from); return c > 0 && k > 0 && c < k; };
       return before(jb.indexOf('public void status(')) && before(jb.indexOf('public void unlock(')); })()
  || !/USE_FINGERPRINT"\s+android:maxSdkVersion="27"\s+tools:node="replace"/.test(readFileSync(MANIFEST, 'utf8'))) {   // cap sync bricht die Zeile um
  console.error('FEHLER: Java-Härtung unvollständig — Build abgebrochen!'); process.exit(1);
}
