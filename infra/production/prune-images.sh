#!/usr/bin/env bash
# Poda las imágenes Docker viejas de uno o más repositorios de imagen.
# Conserva todo ID usado por algún contenedor (en marcha o parado) y, además,
# el ID más nuevo sin uso de cada repositorio (el de rollback). El resto se borra.
# No toca otros repositorios, ni imágenes <none>, ni la caché de build compartida.
set -euo pipefail

usage() {
	echo "Uso: $0 [--apply] REPO [REPO...]" >&2
	echo "  Sin --apply solo muestra qué se conservaría y qué se borraría." >&2
}

apply=0
repos=()
for arg in "$@"; do
	case "$arg" in
	--apply) apply=1 ;;
	-h | --help)
		usage
		exit 0
		;;
	-*)
		echo "ERROR: opción desconocida: $arg" >&2
		usage
		exit 2
		;;
	*) repos+=("$arg") ;;
	esac
done

if [[ ${#repos[@]} -eq 0 ]]; then
	echo "ERROR: indica al menos un repositorio de imagen." >&2
	usage
	exit 2
fi

# IDs completos de las imágenes que usa cualquier contenedor, en marcha o parado.
in_use_ids=""
while IFS= read -r cid; do
	[[ -n "$cid" ]] || continue
	in_use_ids+="$(docker inspect -f '{{.Image}}' "$cid")"$'\n'
done < <(docker ps -aq)

if [[ "$apply" -eq 1 ]]; then
	echo "== Espacio antes =="
	df -h /
else
	echo "== Simulación (usa --apply para borrar) =="
fi

failures=0
for repo in "${repos[@]}"; do
	echo
	echo "== $repo =="

	# ID<TAB>REPO:TAG<TAB>fecha, de la más nueva a la más vieja.
	listing="$(docker images "$repo" --no-trunc --format '{{.ID}}	{{.Repository}}:{{.Tag}}	{{.CreatedAt}}' |
		awk -F'\t' -v repo="$repo" '$2 != "" && index($2, repo ":") == 1' |
		sort -t$'\t' -k3,3r -s)"

	if [[ -z "$listing" ]]; then
		echo "Sin imágenes."
		continue
	fi

	# IDs distintos en orden de más nuevo a más viejo.
	ids="$(printf '%s\n' "$listing" | awk -F'\t' '!seen[$1]++ {print $1}')"

	rollback=""
	while IFS= read -r id; do
		if ! grep -Fxq "$id" <<<"$in_use_ids"; then
			rollback="$id"
			break
		fi
	done <<<"$ids"

	while IFS= read -r id; do
		tags="$(printf '%s\n' "$listing" | awk -F'\t' -v id="$id" '$1 == id {print $2}')"
		if grep -Fxq "$id" <<<"$in_use_ids"; then
			echo "CONSERVAR (en uso)   $id: $(tr '\n' ' ' <<<"$tags")"
			continue
		fi
		if [[ "$id" == "$rollback" ]]; then
			echo "CONSERVAR (rollback) $id: $(tr '\n' ' ' <<<"$tags")"
			continue
		fi
		while IFS= read -r tag; do
			[[ -n "$tag" ]] || continue
			if [[ "$tag" == *":<none>" ]]; then
				echo "OMITIR (sin tag)     $id: $tag"
				continue
			fi
			if [[ "$apply" -eq 1 ]]; then
				echo "BORRAR               $id: $tag"
				if ! docker rmi "$tag"; then
					echo "AVISO: no se pudo borrar $tag; se sigue con el resto." >&2
					failures=$((failures + 1))
				fi
			else
				echo "BORRARÍA             $id: $tag"
			fi
		done <<<"$tags"
	done <<<"$ids"
done

if [[ "$apply" -eq 1 ]]; then
	echo
	echo "== Espacio después =="
	df -h /
fi

if [[ "$failures" -gt 0 ]]; then
	echo "ERROR: fallaron $failures borrados." >&2
	exit 1
fi
