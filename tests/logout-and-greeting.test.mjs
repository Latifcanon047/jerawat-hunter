import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getUserDisplayName, getUserGreeting } from "../src/lib/user-greeting.ts";
import { authConfig } from "../src/auth.config.ts";

// 1. Pengujian resolusi nama pengguna dan fallback email
test("1. getUserDisplayName menampilkan nama pengguna jika tersedia", () => {
  const result = getUserDisplayName({ name: "Ahmad", email: "ahmad@example.com" });
  assert.equal(result, "Ahmad");
});

test("2. getUserDisplayName menggunakan email sebagai fallback jika nama null, kosong, atau whitespace", () => {
  assert.equal(
    getUserDisplayName({ name: null, email: "user@example.com" }),
    "user@example.com"
  );
  assert.equal(
    getUserDisplayName({ name: "", email: "user2@example.com" }),
    "user2@example.com"
  );
  assert.equal(
    getUserDisplayName({ name: "   ", email: "user3@example.com" }),
    "user3@example.com"
  );
});

test("3. getUserDisplayName mengembalikan null jika nama dan email tidak tersedia (tidak mengarang nama)", () => {
  assert.equal(getUserDisplayName({ name: null, email: null }), null);
  assert.equal(getUserDisplayName({ name: " ", email: "   " }), null);
  assert.equal(getUserDisplayName(null), null);
  assert.equal(getUserDisplayName(undefined), null);

  // Backward compatibility test untuk getUserGreeting
  const greetingResult = getUserGreeting({ name: null, email: null });
  assert.equal(greetingResult.displayName, null);
});

// 2. Pengujian komponen DashboardUserHeader
test("4. DashboardUserHeader menyediakan navigasi sidebar responsif dan dialog logout", () => {
  const componentPath = resolve(process.cwd(), "src/components/dashboard/dashboard-user-header.tsx");
  const code = readFileSync(componentPath, "utf-8");

  // Periksa tombol logout berwarna merah dengan teks putih kontras
  assert.ok(code.includes("bg-rose-700"), "Tombol logout harus menggunakan warna merah bg-rose-700");
  assert.ok(code.includes("text-white"), "Teks dan ikon tombol logout harus putih untuk kontras memadai");
  assert.ok(code.includes("hover:bg-rose-800"), "Harus memiliki state hover hover:bg-rose-800");
  assert.ok(code.includes('aria-label={`Menu akun${displayName ? ` ${displayName}` : ""}`}'));
  assert.ok(code.includes('aria-label="Menu akun"'));
  assert.ok(code.includes("aria-expanded={accountOpen}"));
  assert.ok(code.includes("aria-controls={accountMenuId}"));
  assert.ok(code.includes("min-[360px]:w-auto sm:hidden"));
  assert.ok(code.includes("max-[359px]:hidden"));
  assert.ok(code.includes('document.addEventListener("pointerdown", handlePointerDown)'));
  assert.ok(code.includes('document.addEventListener("keydown", handleKeyDown)'));
  assert.ok(code.includes("Pengaturan"));
  assert.ok(code.includes("Segera hadir"));
  assert.ok(code.includes("disabled"));
  assert.ok(code.includes("Logout"));

  // Periksa aksesibilitas drawer dan prioritas logo pada mobile
  assert.ok(code.includes('aria-label={sidebarOpen ? "Tutup navigasi" : "Buka navigasi"}'));
  assert.ok(code.includes("aria-expanded={sidebarOpen}"));
  assert.ok(code.includes("aria-controls={sidebarId}"));
  assert.ok(code.includes("hidden shrink-0 text-base font-semibold"));
  assert.ok(code.includes('src="/jawhan-logo.png"'), "Logo aset brand harus dipakai di header dan sidebar");
  assert.ok(code.includes("object-contain"), "Logo harus mempertahankan proporsi");
  assert.ok(code.includes("min-h-11"), "Kontrol header memiliki area sentuh minimal 44px");
  assert.ok(
    !code.includes("Halo,"),
    "Header pengguna tidak boleh menampilkan sapaan 'Halo,' sesuai keputusan desain"
  );
  assert.ok(
    !code.includes("Halo"),
    "Header pengguna tidak boleh menampilkan sapaan 'Halo' sesuai keputusan desain"
  );

  // Periksa responsivitas (truncate dan min-w-0 agar nama panjang tidak mendorong tombol keluar viewport)
  assert.ok(code.includes("truncate"), "Harus menggunakan truncate untuk mencegah overflow teks di mobile");
  assert.ok(code.includes("min-w-0"), "Harus menggunakan min-w-0 untuk truncation yang aman");
  assert.ok(code.includes('aria-label="Tutup sidebar"'));
  assert.ok(code.includes('aria-modal="true"'));
  assert.ok(code.includes('aria-label="Navigasi utama"'));
  assert.ok(code.includes('pathname === "/picking"'));
  assert.ok(code.includes('pathname === "/picking/analysis"'));
  assert.ok(code.includes('pathname === "/resistance"'));
  assert.ok(code.includes('pathname === "/"'));
  assert.ok(code.includes('pathname === "/pause"'));
  assert.ok(code.includes('active={pathname === "/"}'));
  assert.ok(code.includes('active={pathname === "/pause"}'));
  assert.ok(!code.includes("pathname.startsWith"));
  assert.ok(code.includes("handleSidebarBackdropClick"), "Klik backdrop harus menutup drawer");
  assert.ok(code.includes("closeSidebarForNavigation"), "Navigasi harus menutup drawer");
  assert.ok(code.includes('href="/pause"'), "Sidebar Pause harus memakai route tombol Pause dashboard");
  assert.ok(existsSync(resolve(process.cwd(), "public/jawhan-logo.png")));
  assert.ok(code.includes("key={pathname}"), "Drawer harus disegarkan saat route berubah");

  // Periksa dialog konfirmasi
  assert.ok(code.includes('role="dialog"'), "Harus memiliki atribut role='dialog'");
  assert.ok(code.includes('aria-modal="true"'), "Harus memiliki atribut aria-modal='true'");
  assert.ok(code.includes("Konfirmasi Keluar"), "Harus memiliki judul dialog konfirmasi");
  assert.ok(code.includes("Batal"), "Harus memiliki tombol Batal");
  assert.ok(code.includes("Escape"), "Harus menangani tombol Escape untuk membatalkan konfirmasi");

  // Periksa penanganan error dan status loading
  assert.ok(code.includes('role="alert"'), "Harus memiliki elemen role='alert' untuk pesan error");
  assert.ok(code.includes("isPending"), "Harus mengelola status loading isPending");
});

// 3. Pengujian Server Action logoutUser di src/actions/auth.ts
test("5. Server action logoutUser memanfaatkan signOut resmi Auth.js dengan redirect ke /login", () => {
  const actionPath = resolve(process.cwd(), "src/actions/auth.ts");
  const code = readFileSync(actionPath, "utf-8");

  assert.ok(
    code.includes('import { signIn, signOut } from "@/auth";'),
    "Harus mengimpor signOut dari @/auth"
  );
  assert.ok(
    code.includes("export async function logoutUser"),
    "Harus mengekspor fungsi logoutUser"
  );
  assert.ok(
    code.includes('await signOut({ redirectTo: "/login" });'),
    "Harus memanggil signOut dengan redirectTo: '/login'"
  );
  assert.ok(
    code.includes("NEXT_REDIRECT"),
    "Harus meneruskan redirect error Next.js ke client router"
  );
});

// 4. Pengujian integrasi Dashboard dan arsitektur Suspense di src/app/page.tsx
test("6. Semua halaman privat memakai header bersama dan halaman autentikasi tetap terpisah", () => {
  const pagePath = resolve(process.cwd(), "src/app/page.tsx");
  const code = readFileSync(pagePath, "utf-8");

  assert.ok(
    code.includes("export default function Home()"),
    "Home harus merupakan komponen sinkron agar static shell dapat diprerender"
  );
  assert.ok(code.includes("<PrivateAppHeader />"), "Beranda harus memakai header bersama");

  const privateHeaderPath = resolve(
    process.cwd(),
    "src/components/dashboard/private-app-header.tsx"
  );
  const privateHeaderCode = readFileSync(privateHeaderPath, "utf-8");
  assert.ok(privateHeaderCode.includes("<Suspense"));
  assert.ok(privateHeaderCode.includes("async function AuthenticatedHeader()"));
  assert.ok(privateHeaderCode.includes("const session = await auth();"));
  assert.ok(privateHeaderCode.includes("<DashboardUserHeader user={session?.user} />"));

  const privatePages = [
    "src/app/page.tsx",
    "src/app/pause/page.tsx",
    "src/app/picking/page.tsx",
    "src/app/picking/analysis/page.tsx",
    "src/app/picking/new/page.tsx",
    "src/app/resistance/page.tsx",
  ];
  for (const relativePath of privatePages) {
    const pageCode = readFileSync(resolve(process.cwd(), relativePath), "utf-8");
    assert.ok(pageCode.includes("PrivateAppHeader"), `${relativePath} harus memakai header bersama`);
  }

  const authPages = [
    "src/app/login/page.tsx",
    "src/app/register/page.tsx",
    "src/app/forgot-password/page.tsx",
    "src/app/reset-password/page.tsx",
  ];
  for (const relativePath of authPages) {
    const pageCode = readFileSync(resolve(process.cwd(), relativePath), "utf-8");
    assert.ok(!pageCode.includes("PrivateAppHeader"), `${relativePath} tidak boleh memakai header privat`);
  }

  const headerPos = code.indexOf("<PrivateAppHeader />");
  const appTitlePos = code.indexOf("JERAWAT HUNTER");

  assert.ok(headerPos !== -1, "PrivateAppHeader harus ada");
  assert.ok(appTitlePos !== -1, "Teks JERAWAT HUNTER harus ada");

  assert.ok(
    headerPos < appTitlePos,
    "Header bersama harus diletakkan sebelum konten beranda"
  );
});

// 5. Pengujian proteksi rute privat setelah logout
test("7. Auth configuration menolak akses ke rute privat saat sesi berakhir", () => {
  const authorized = authConfig.callbacks.authorized;

  // Pengguna belum login mencoba akses halaman utama / privat
  const unauthenticatedRoot = authorized({
    auth: null,
    request: { nextUrl: new URL("http://localhost:3000/") },
  });
  assert.equal(unauthenticatedRoot, false, "Rute privat / harus ditolak saat unauthenticated");

  const unauthenticatedPicking = authorized({
    auth: null,
    request: { nextUrl: new URL("http://localhost:3000/picking") },
  });
  assert.equal(unauthenticatedPicking, false, "Rute privat /picking harus ditolak saat unauthenticated");

  const unauthenticatedAnalysis = authorized({
    auth: null,
    request: { nextUrl: new URL("http://localhost:3000/picking/analysis") },
  });
  assert.equal(unauthenticatedAnalysis, false, "Rute privat /picking/analysis harus ditolak saat unauthenticated");

  // Rute publik login tetap dapat diakses
  const publicLogin = authorized({
    auth: null,
    request: { nextUrl: new URL("http://localhost:3000/login") },
  });
  assert.equal(publicLogin, true, "Halaman login harus tetap dapat diakses");
});
