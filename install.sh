#!/bin/sh
# Install the Sarvam Code CLI from the public downloads CDN.
#
# Usage:
#   curl -fsSL https://code.sarvam.ai/install.sh | sh
#   curl -fsSL https://code.sarvam.ai/install.sh | sh -s -- --version 0.30.0
#   curl -fsSL https://code.sarvam.ai/install.sh | sh -s -- --lean
#   ./install.sh [options]
#
# Options (take precedence over the matching environment variable):
#   --version <version>    Install a specific version (e.g. 0.30.0 or v0.30.0);
#                          defaults to the current stable version.
#   --install-dir <dir>    Install directory (default: $HOME/.local/bin).
#   --lean                 Install the lean Linux build: no desktop-GUI webview
#                          (so no WebKitGTK/GTK runtime dependency) and a lower
#                          glibc floor, which is what makes it start on older
#                          distros and inside eval/benchmark containers. Ignored
#                          on macOS, where the default build already needs
#                          nothing extra.
#   -h, --help             Show this help and exit.
#
# The layout served under https://code.sarvam.ai mirrors the S3 downloads
# bucket populated by the release pipeline (publish-cli-s3):
#   /stable.txt                               -> the current stable version, e.g. "0.30.0"
#   /v<version>/sarvam-code-<os>-<arch>       -> the platform binaries
#   /v<version>/sarvam-code-linux-<arch>-lean -> the lean Linux binaries
#   /v<version>/SHA256SUMS                    -> sha256sum-format checksums for that version
#
# Environment overrides:
#   SARVAM_CODE_BASE_URL      base CDN URL          (default: https://code.sarvam.ai)
#   SARVAM_CODE_VERSION       pin a version         (default: contents of stable.txt; a
#                                                    leading "v" is accepted and stripped)
#   SARVAM_CODE_INSTALL_DIR   install directory     (default: $HOME/.local/bin)
#   SARVAM_CODE_BINARY        installed binary name (default: sarvam-code)
#   SARVAM_CODE_LEAN          set to 1 to install the lean build (same as --lean)

set -eu

BASE_URL="${SARVAM_CODE_BASE_URL:-https://code.sarvam.ai}"
BINARY_NAME="${SARVAM_CODE_BINARY:-sarvam-code}"
INSTALL_DIR="${SARVAM_CODE_INSTALL_DIR:-$HOME/.local/bin}"
VERSION_PIN="${SARVAM_CODE_VERSION:-}"
LEAN="${SARVAM_CODE_LEAN:-}"

usage() {
	cat <<'EOF'
Install the Sarvam Code CLI from the public downloads CDN.

Usage:
  curl -fsSL https://code.sarvam.ai/install.sh | sh
  curl -fsSL https://code.sarvam.ai/install.sh | sh -s -- --version 0.30.0
  curl -fsSL https://code.sarvam.ai/install.sh | sh -s -- --lean
  ./install.sh [options]

Options (take precedence over the matching environment variable):
  --version <version>    Install a specific version (e.g. 0.30.0 or v0.30.0);
                         defaults to the current stable version.
  --install-dir <dir>    Install directory (default: $HOME/.local/bin).
  --lean                 Install the lean Linux build: no desktop-GUI webview
                         (no WebKitGTK/GTK runtime dependency) and a lower glibc
                         floor, so it starts on older distros and inside
                         eval/benchmark containers. Ignored on macOS.
  -h, --help             Show this help and exit.

Environment overrides:
  SARVAM_CODE_BASE_URL, SARVAM_CODE_VERSION, SARVAM_CODE_INSTALL_DIR,
  SARVAM_CODE_BINARY, SARVAM_CODE_LEAN
EOF
}

# parse_args: flags override the env-derived defaults above.
parse_args() {
	while [ $# -gt 0 ]; do
		case "$1" in
		--version)
			[ $# -ge 2 ] || err "--version requires an argument."
			VERSION_PIN="$2"
			shift 2
			;;
		--version=*)
			VERSION_PIN="${1#*=}"
			shift
			;;
		--install-dir)
			[ $# -ge 2 ] || err "--install-dir requires an argument."
			INSTALL_DIR="$2"
			shift 2
			;;
		--install-dir=*)
			INSTALL_DIR="${1#*=}"
			shift
			;;
		--lean)
			LEAN=1
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			err "unknown argument '$1' (try --help)."
			;;
		esac
	done
}

# Trim leading/trailing whitespace (incl. trailing newline from stable.txt).
trim() {
	printf '%s' "$1" | tr -d '[:space:]'
}

err() {
	printf 'Error: %s\n' "$1" >&2
	exit 1
}

# Pick a downloader once, up front.
detect_downloader() {
	if command -v curl >/dev/null 2>&1; then
		DOWNLOADER="curl"
	elif command -v wget >/dev/null 2>&1; then
		DOWNLOADER="wget"
	else
		err "need curl or wget on PATH to download the CLI."
	fi
}

# fetch_stdout <url> -> prints the response body to stdout, fails on HTTP error.
fetch_stdout() {
	url="$1"
	if [ "$DOWNLOADER" = "curl" ]; then
		curl -fsSL --retry 3 --retry-delay 2 "$url"
	else
		wget -qO- "$url"
	fi
}

# fetch_file <url> <dest> -> saves the response body to dest, fails on HTTP error.
fetch_file() {
	url="$1"
	dest="$2"
	if [ "$DOWNLOADER" = "curl" ]; then
		curl -fSL --retry 3 --retry-delay 2 -o "$dest" "$url"
	else
		wget -q -O "$dest" "$url"
	fi
}

# Map uname output to the {os}-{arch} suffix used by the published assets.
# The release pipeline builds only linux-amd64, linux-arm64, and darwin-arm64.
detect_platform() {
	os=$(uname -s | tr '[:upper:]' '[:lower:]')
	arch=$(uname -m | tr '[:upper:]' '[:lower:]')

	case "$os" in
	linux) PLATFORM_OS="linux" ;;
	darwin) PLATFORM_OS="darwin" ;;
	*) err "unsupported OS '$os' (supported: linux, darwin)." ;;
	esac

	case "$arch" in
	x86_64 | amd64) PLATFORM_ARCH="amd64" ;;
	aarch64 | arm64) PLATFORM_ARCH="arm64" ;;
	*) err "unsupported architecture '$arch' (supported: amd64, arm64)." ;;
	esac

	# No Intel-mac binary is published; an arm64 build cannot run on x86_64.
	if [ "$PLATFORM_OS" = "darwin" ] && [ "$PLATFORM_ARCH" = "amd64" ]; then
		err "Intel Macs are not supported; only Apple Silicon (arm64) builds are published."
	fi

	PLATFORM="${PLATFORM_OS}-${PLATFORM_ARCH}"
}

# Resolve the published asset name for this platform and variant.
#
# The lean variant exists only for Linux: it is the build without the desktop-GUI
# webview, linked against a pinned older sysroot, which is what gives it a lower
# glibc floor and no WebKitGTK/GTK runtime dependency. On macOS the default build
# uses the WKWebView system framework and needs nothing extra, so there is no
# lean asset to fetch and `--lean` is a no-op rather than an error.
resolve_asset() {
	ASSET="${BINARY_NAME}-${PLATFORM}"
	[ -n "$LEAN" ] || return 0
	if [ "$PLATFORM_OS" != "linux" ]; then
		printf 'Note: --lean applies to Linux only; installing the default %s build.\n' \
			"$PLATFORM_OS" >&2
		return 0
	fi
	ASSET="${ASSET}-lean"
}

resolve_version() {
	VERSION="$VERSION_PIN"
	if [ -z "$VERSION" ]; then
		VERSION=$(fetch_stdout "${BASE_URL}/stable.txt") ||
			err "could not fetch ${BASE_URL}/stable.txt — pin one with SARVAM_CODE_VERSION."
	fi
	# Accept "v0.30.0" or "0.30.0"; normalize to the bare number.
	VERSION=$(trim "$VERSION")
	VERSION="${VERSION#v}"
	[ -n "$VERSION" ] || err "resolved an empty version."
}

# Verify <file> against the published SHA256SUMS for this version.
verify_checksum() {
	file="$1"
	asset="$2"
	sums="$3"

	expected=$(grep "  ${asset}\$" "$sums" | awk '{print $1}' | head -n1)
	if [ -z "$expected" ]; then
		err "no checksum for ${asset} in SHA256SUMS."
	fi

	if command -v sha256sum >/dev/null 2>&1; then
		actual=$(sha256sum "$file" | awk '{print $1}')
	elif command -v shasum >/dev/null 2>&1; then
		actual=$(shasum -a 256 "$file" | awk '{print $1}')
	else
		printf 'Warning: no sha256 tool found; skipping checksum verification.\n' >&2
		return 0
	fi

	if [ "$actual" != "$expected" ]; then
		err "checksum mismatch for ${asset} (expected ${expected}, got ${actual})."
	fi
	printf 'Checksum verified.\n'
}

check_install_dir_on_path() {
	case ":${PATH}:" in
	*":${INSTALL_DIR}:"*) ;;
	*)
		printf 'Warning: %s is not on PATH.\n' "$INSTALL_DIR" >&2
		printf 'Add this to your shell profile and reload it:\n' >&2
		# $PATH is meant to stay literal in the printed instruction.
		# shellcheck disable=SC2016
		printf '  export PATH="%s:$PATH"\n' "$INSTALL_DIR" >&2
		;;
	esac
}

main() {
	parse_args "$@"
	detect_downloader
	detect_platform
	resolve_version
	resolve_asset

	asset="$ASSET"
	asset_url="${BASE_URL}/v${VERSION}/${asset}"
	sums_url="${BASE_URL}/v${VERSION}/SHA256SUMS"
	target="${INSTALL_DIR}/${BINARY_NAME}"

	tmp_dir=$(mktemp -d)
	trap 'rm -rf "$tmp_dir"' EXIT INT TERM

	variant=""
	case "$asset" in
	*-lean) variant=" lean" ;;
	esac
	printf 'Installing %s v%s (%s%s)\n' "$BINARY_NAME" "$VERSION" "$PLATFORM" "$variant"

	printf 'Downloading %s ...\n' "$asset_url"
	fetch_file "$asset_url" "${tmp_dir}/${asset}" ||
		err "failed to download ${asset_url}"
	[ -s "${tmp_dir}/${asset}" ] || err "downloaded ${asset} is empty."

	if fetch_file "$sums_url" "${tmp_dir}/SHA256SUMS" 2>/dev/null; then
		verify_checksum "${tmp_dir}/${asset}" "$asset" "${tmp_dir}/SHA256SUMS"
	else
		printf 'Warning: could not fetch SHA256SUMS; skipping checksum verification.\n' >&2
	fi

	mkdir -p "$INSTALL_DIR"
	chmod +x "${tmp_dir}/${asset}"
	mv -f "${tmp_dir}/${asset}" "$target"

	printf 'Installed %s\n' "$target"
	check_install_dir_on_path
	"$target" --version || true
}

main "$@"
