# Vela Wallet — Desktop

The desktop client, built on [gpui](https://github.com/zed-industries/zed) (Zed's
UI framework). This crate is **standalone** — it is not a member of the
`rust/` workspace, so all commands run from this directory.

Linux has the largest system dependency set. macOS needs Xcode command-line
tools; Windows needs MSVC build tools and LLVM's `libclang.dll`. The remaining
sections detail the Linux packages, with the Windows bootstrap immediately
below.

---

## Table of contents

- [What the build actually needs](#what-the-build-actually-needs)
- [Install the system dependencies](#install-the-system-dependencies)
- [Windows 11 setup](#windows-11-setup)
- [Build a Windows installer](#build-a-windows-installer)
- [Build & run](#build--run)
- [What the first build does](#what-the-first-build-does)
- [Environment pins](#environment-pins)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)

---

## What the build actually needs

Two direct dependencies drive the entire system-package list, plus one path dep:

| Dependency | Declared at | Pulls in |
|---|---|---|
| `gpui` + `gpui_platform` | [Cargo.toml:7-8](Cargo.toml#L7-L8) | Wayland/X11, xkbcommon, fontconfig, Vulkan, ALSA |
| `dotlottie-rs` | [Cargo.toml:28](Cargo.toml#L28) | **A C++ compiler** — ThorVG is compiled from vendored C++ |
| `vela-core` | [Cargo.toml:11](Cargo.toml#L11) | Pure Rust, no system deps. `i18n-all` compiles all 15 locale catalogs in |

Three notes that are easy to get wrong:

- **The C++ toolchain is not optional.** `dotlottie-rs`'s `build.rs` drives
  `cc::Build` with `.cpp(true)` and calls `cc_build.compile("thorvg")`. A box
  with `cc` but no `c++` fails partway into the build, not at the start.
- **No cmake or meson is required for ThorVG** — despite what the upstream
  project's own docs suggest, the Rust binding compiles the sources directly.
  cmake is still worth having for gpui's transitive crates that fall back to a
  vendored build when pkg-config misses.
- **The build is offline after the fetch.** [Cargo.toml:20-24](Cargo.toml#L20-L24)
  deliberately omits the `tvg-wg` / `tvg-gl` features, because ThorVG's
  `build.rs` *downloads prebuilt archives over HTTP* under `tvg-wg`. Adding a
  GPU backend later re-introduces a network dependency on every build.

### Rust toolchain

`rustc` **1.97.1**, matching the pin in [rust-toolchain.toml](../../rust/rust-toolchain.toml).
The crate is `edition = "2024"`, so older toolchains will not parse it.

---

## Install the system dependencies

### Windows 11 setup

The default build uses the MSVC Rust target (`x86_64-pc-windows-msvc`). Two
separate native toolchains are required:

| Toolchain | Used for |
|---|---|
| Visual Studio Build Tools, **Desktop development with C++** workload | Compiling ThorVG's vendored C++ sources |
| LLVM | Providing `libclang.dll` for `dotlottie-rs`'s `bindgen` build step |

Install the Visual Studio workload in the Visual Studio Installer, or use:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
```

Install LLVM, then point `bindgen` at its `bin` directory:

```powershell
winget install --id LLVM.LLVM --exact
setx LIBCLANG_PATH "C:\Program Files\LLVM\bin"
```

Restart the terminal (and the IDE's integrated terminal) after `setx`, then
run:

```powershell
cd app-desktop\vela-wallet
cargo run
```

For the current PowerShell session only, set the variable directly instead of
restarting it:

```powershell
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
cargo run
```

#### Window controls

The app uses a transparent, custom titlebar to match the design. The empty
band above the Vela mark is a native Windows caption area. Its upper-right
corner also contains explicit **minimize**, **maximize/restore**, and **close**
buttons:

- Drag it to move the window or use Windows 11 Snap Layouts.
- Double-click it to maximize or restore the window.
- Right-click it to open the standard Windows window menu.
- Press `F11` to toggle fullscreen.

Fedora GNOME/Wayland uses the same three controls when it supplies no server
titlebar; X11 and other server-decorated sessions retain their native controls.

If these actions do not work, make sure the executable was rebuilt after a
source update (`cargo run`), rather than reusing an already-running instance.

### Build a Windows installer

Distribute the installer, not the raw `vela-wallet.exe`: it embeds the release
application and Microsoft's signed Visual C++ Redistributable. It creates a
Start-menu shortcut (with an optional desktop shortcut), and installs the
runtime before it offers to launch the app.

Install Inno Setup once:

```powershell
winget install --id JRSoftware.InnoSetup --exact
```

#### x64 installer (default)

Build this package for ordinary Intel/AMD 64-bit Windows 10/11 devices:

```powershell
.\scripts\build-windows-installer.ps1
```

Output: `dist\windows\VelaWallet-Setup-<version>-x64.exe`.

#### ARM64 installer (cross-compiled from x64 Windows)

You do **not** need an ARM64 Windows development machine to create a native
Windows on ARM package. Before the first ARM64 build, install the Rust target
and add **MSVC v143 - VS 2022 C++ ARM64 build tools** in Visual Studio
Installer. Then run:

```powershell
rustup target add aarch64-pc-windows-msvc
.\scripts\build-windows-installer.ps1 -Architecture arm64
```

Output: `dist\windows\VelaWallet-Setup-<version>-arm64.exe`.

The script automatically selects Visual Studio's x64-hosted ARM64 compiler,
builds the `aarch64-pc-windows-msvc` target, and bundles the Microsoft ARM64
VC++ Redistributable. It stops with an actionable error if the Rust target or
ARM64 C++ tools are unavailable. `-SkipBuild` may be added when the matching
release executable has already been built and only the installer needs
repackaging.

| Package | Distribute to | Command |
|---|---|---|
| `VelaWallet-Setup-<version>-x64.exe` | Intel/AMD x64 Windows 10/11 | `./scripts/build-windows-installer.ps1` |
| `VelaWallet-Setup-<version>-arm64.exe` | Native Windows on ARM64 | `./scripts/build-windows-installer.ps1 -Architecture arm64` |

Both installers print a SHA-256 checksum for publishing next to the download.
The `dist/` directory and downloaded prerequisites are generated and ignored by
Git. An ARM64 executable cannot run on an x64 Windows machine, so complete the
final install and window-behaviour check on a physical ARM64 Windows device or
an ARM64 CI runner. The x64 package can run under Windows on ARM emulation, but
it is not a substitute for distributing the native ARM64 package.

Release builds use the Windows GUI subsystem, so users see no console window.
Debug builds keep the console available for `cargo run` diagnostics.

The generated installer is **unsigned** until a code-signing certificate is
configured. It works, but Windows SmartScreen can show an “unknown publisher”
warning on first release. Sign the final installer before a public release.

### Fedora / RHEL

```bash
sudo dnf install -y \
  gcc-c++ clang cmake make pkgconf-pkg-config \
  wayland-devel libxkbcommon-x11-devel libxcb-devel \
  fontconfig-devel freetype-devel alsa-lib-devel \
  openssl-devel libzstd-devel vulkan-loader mesa-vulkan-drivers
```

### Debian / Ubuntu

```bash
sudo apt install -y \
  build-essential clang cmake pkg-config \
  libwayland-dev libxkbcommon-x11-dev libx11-xcb-dev \
  libfontconfig-dev libasound2-dev \
  libssl-dev libzstd-dev libvulkan1 mesa-vulkan-drivers
```

### Arch

```bash
sudo pacman -S --needed \
  base-devel clang cmake pkgconf \
  wayland libxkbcommon-x11 libxcb \
  fontconfig alsa-lib \
  openssl zstd vulkan-icd-loader
```

These lists are the intersection of gpui's needs with [Zed's own
`script/linux`](https://github.com/zed-industries/zed/blob/main/script/linux),
trimmed of the packages that serve Zed-the-editor rather than gpui-the-crate
(`sqlite`, `libgit2`, `libva`, `pipewire`, `xdg-desktop-portal`, `musl`, `jq`).
If a gpui bump ever fails on a missing library, that script is the place to look
first — add `glib2-devel` before anything else.

### Why each group

| Packages | Needed for |
|---|---|
| `gcc-c++` | ThorVG's vendored C++ sources |
| `wayland-devel`, `libxkbcommon-x11-devel`, `libxcb-devel` | gpui's Linux windowing and keyboard handling — both display servers |
| `fontconfig-devel`, `freetype-devel` | Font enumeration and rasterization (`gpui_platform`'s `font-kit` feature) |
| `vulkan-loader` + a driver (`mesa-vulkan-drivers`) | gpui renders through Vulkan via blade. **Runtime**, not just build-time |
| `alsa-lib-devel` | gpui's audio path. Carried over from Zed's own list rather than proven necessary for this crate — cheap to install, annoying to discover missing mid-build |
| `openssl-devel`, `libzstd-devel` | Transitive Rust crates that prefer the system library over a vendored build |

---

## Build & run

```bash
cd app-desktop/vela-wallet
cargo run
```

The window opens at **1280×800** — the mocks' logical size, which is also the
minimum. Wider windows flex the card grid; the action panel keeps its width.

---

## What the first build does

Budget real time for the cold build, and don't interrupt it:

1. **Clones `zed-industries/zed`.** `gpui` and `gpui_platform` are git
   dependencies on the full Zed repository, which is large. This is the slowest
   single step and it is pure network.
2. **Compiles ThorVG from C++.** Hundreds of translation units through `cc`.
3. **Compiles gpui**, then this crate.

`dotlottie-rs` and `thorvg` land in `~/.cargo/git` and are reused across
rebuilds; only the first fetch pays for them. Expect a multi-gigabyte
`~/.cargo` and a `target/` directory to match.

---

## Environment pins

The app follows the system appearance and the system/env locale by default.
Both can be pinned without touching system settings:

```bash
cargo run                                  # system appearance + system locale
VELA_THEME=dark cargo run                  # force dark
VELA_THEME=light cargo run                 # force light
VELA_LANG=de cargo run                     # any of the 15 supported tags
VELA_THEME=light VELA_LANG=zh cargo run    # both
```

| Variable | Read at | Effect |
|---|---|---|
| `VELA_THEME` | [theme.rs:21](src/theme.rs#L21) | `dark` / `light`. Pinning it also **stops** the live restyle on OS appearance change |
| `VELA_LANG` | [loc.rs:20](src/loc.rs#L20) | First entry in the chain `VELA_LANG` → `LC_ALL` → `LC_MESSAGES` → `LANG`. Unrecognized tags fall back to `en` |
| `VELA_SKIP_LAUNCH_ANIMATION=1` | [theme.rs:218](src/theme.rs#L218) | Skips the launch animation outright. For tests and screenshots — the deterministic alternative to sleeping ~1.9 s |
| `VELA_UPDATE_GOLDEN=1` | [launch_animation.rs:869](src/ui/launch_animation.rs#L869) | Rewrites the golden references instead of asserting against them. Review the diff — a change here means the animation changed on this platform |

---

## Tests

```bash
cargo test                       # everything: fit-rule table, texture-lifetime bound, goldens
cargo test golden -- --nocapture # just the golden frames
```

> The quickstart in `specs/012-launch-animation-lottie/` gives the filter as
> `launch_golden`. That matches no test — the real name is
> `golden_frames_match_the_committed_references`, so filter on `golden`.

The golden PNGs live in [tests/golden/](tests/golden/) — five frames per
appearance, at frames 0 / 24 / 45 / 65 / 101. Regenerate with
`VELA_UPDATE_GOLDEN=1`, never by hand.

**The texture-lifetime test is not decoration.** A leak of one GPU texture per
frame is invisible on screen and only surfaces after repeated launches; see
`specs/012-launch-animation-lottie/contracts/desktop-frame-pump.md`.

If you touch the localization corpus, the round-trip runs from the repo root:

```bash
node scripts/gen-i18n.mjs                      # regenerate catalogs + paths.rs
cargo test -p vela-core --features i18n-all    # conformance corpus stays green
```

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Unable to find libclang` from `bindgen` | Install LLVM and set `LIBCLANG_PATH` to the directory containing `libclang.dll`; see [Windows 11 setup](#windows-11-setup) |
| Windows window cannot move or maximize | Run the current executable and use the titlebar controls or empty band above the Vela mark; see [Window controls](#window-controls) |
| Build dies inside `dotlottie-rs`/`thorvg` with C++ errors or a missing compiler | `gcc-c++` not installed. `cc` alone is not enough |
| `pkg-config` cannot find `wayland-client`, `xkbcommon`, or `fontconfig` | The `-devel` / `-dev` packages are missing; the runtime library alone does not satisfy the build |
| Build succeeds, window never appears, Vulkan error at startup | `vulkan-loader` is present but no ICD. Install `mesa-vulkan-drivers` (or your GPU vendor's driver) |
| The build tries to reach the network on every rebuild | A `tvg-wg` / `tvg-gl` feature crept into the `dotlottie-rs` dependency. See [Cargo.toml:20-24](Cargo.toml#L20-L24) |
| `edition2024` / unstable feature errors | Toolchain older than 1.97.1 |
