// Patch and helpers for JointJS embed issues
// waits for window.joint to exist and never references an undefined `joint` identifier.

(function () {
	const MAX_RETRIES = 50;
	const RETRY_INTERVAL = 100;

	function applyPatchOnce() {
		const jointGlobal = window.joint;
		if (!jointGlobal || !jointGlobal.dia || !jointGlobal.dia.Cell) {
			return false;
		}

		const CellProto = jointGlobal.dia.Cell.prototype;
		if (!CellProto) return false;

		if (!CellProto._patched_getEmbeddedCells) {
			const orig = CellProto.getEmbeddedCells;
			CellProto.getEmbeddedCells = function (options) {
				try {
					let raw;
					if (typeof orig === "function") {
						try {
							raw = orig.apply(this, arguments);
						} catch (e) {
							raw = this.get && this.get("embeds");
						}
					} else {
						raw = this.get && this.get("embeds");
					}

					if (!raw) return [];

					if (raw && typeof raw.toArray === "function") {
						try {
							return raw.toArray().filter(Boolean);
						} catch (e) {
							console.warn(
								"joint-patches: getEmbeddedCells toArray error, falling back",
								e,
							);
						}
					}

					if (Array.isArray(raw)) {
						return raw
							.map((item) => {
								if (!item) return null;
								if (typeof item === "string" || typeof item === "number") {
									return this.graph && this.graph.getCell
										? this.graph.getCell(String(item)) || String(item)
										: String(item);
								}
								return item;
							})
							.filter(Boolean);
					}

					// object keyed -> use values
					if (typeof raw === "object") {
						const vals = Object.keys(raw)
							.map((k) => raw[k])
							.filter(Boolean);
						if (vals.length) {
							return vals
								.map((v) => {
									if (!v) return null;
									if (typeof v === "string" || typeof v === "number") {
										return this.graph && this.graph.getCell
											? this.graph.getCell(String(v)) || String(v)
											: String(v);
									}
									return v;
								})
								.filter(Boolean);
						}
					}

					// single id
					if (typeof raw === "string" || typeof raw === "number") {
						const c =
							this.graph && this.graph.getCell
								? this.graph.getCell(String(raw))
								: null;
						return c ? [c] : [String(raw)];
					}

					return Array.isArray(raw) ? raw : [raw];
				} catch (err) {
					// Never throw from patched method
					console.warn(
						"joint-patches: patched getEmbeddedCells error, returning []",
						err,
					);
					return [];
				}
			};
			CellProto._patched_getEmbeddedCells = true;
			console.info("joint-patches: getEmbeddedCells patched");
		}

		//normalize embeds of one cell to an array of ids (strings) ---
		function normalizeEmbedsOfCell(cell) {
			if (!cell || !cell.get) return;
			const raw = cell.get("embeds");
			if (!raw) {
				cell.set("embeds", [], { silent: true });
				return;
			}

			// Array
			if (Array.isArray(raw)) {
				const cleaned = raw
					.map((x) => {
						if (!x) return null;
						if (typeof x === "object" && x.id) return String(x.id);
						if (typeof x === "string" || typeof x === "number")
							return String(x);
						if (x && x.id) return String(x.id);
						return null;
					})
					.filter(Boolean);
				cell.set("embeds", cleaned, { silent: true });
				return;
			}

			// Backbone.Collection
			if (raw && typeof raw.toArray === "function") {
				try {
					const arr = raw
						.toArray()
						.map((c) => (c && c.id ? String(c.id) : null))
						.filter(Boolean);
					cell.set("embeds", arr, { silent: true });
					return;
				} catch (e) {
					console.warn(
						"joint-patches: normalizeEmbedsOfCell toArray error, falling back",
						e,
					);
				}
			}

			// object keyed
			if (typeof raw === "object") {
				const vals = Object.keys(raw)
					.map((k) => raw[k])
					.filter(Boolean)
					.map((v) =>
						v && v.id
							? String(v.id)
							: typeof v === "string" || typeof v === "number"
							? String(v)
							: null,
					)
					.filter(Boolean);
				if (vals.length) {
					cell.set("embeds", vals, { silent: true });
					return;
				}
			}

			// single value
			if (typeof raw === "string" || typeof raw === "number") {
				cell.set("embeds", [String(raw)], { silent: true });
				return;
			}

			cell.set("embeds", [], { silent: true });
		}

		// normalize all cells in a graph
		function normalizeAllEmbeds(graph) {
			if (!graph || typeof graph.getCells !== "function") return;
			graph.getCells().forEach((cell) => {
				try {
					normalizeEmbedsOfCell(cell);
				} catch (e) {
					console.warn(
						"joint-patches: normalizeAllEmbeds error for cell",
						cell && cell.id,
						e,
					);
				}
			});
			console.info("joint-patches: normalizeAllEmbeds completed");
		}

		// wire graph listeners to normalize on add/embed/unembed/change:embeds
		function wireNormalizeOnEmbed(graph) {
			if (!graph) return;

			graph.on("add", function (cell) {
				try {
					normalizeEmbedsOfCell(cell);
					const parentId = cell.get && cell.get("parent");
					if (parentId) {
						const p = graph.getCell(parentId);
						if (p) normalizeEmbedsOfCell(p);
					}
				} catch (e) {}
			});

			graph.on("cell:embedded cell:unembedded", function () {
				try {
					// normalize all parents
					normalizeAllEmbeds(graph);
				} catch (e) {}
			});

			graph.on("change:embeds", function (cell) {
				try {
					normalizeEmbedsOfCell(cell);
				} catch (e) {}
			});
		}

		// helpers
		window.__jointPatches = window.__jointPatches || {};
		window.__jointPatches.normalizeEmbedsOfCell = normalizeEmbedsOfCell;
		window.__jointPatches.normalizeAllEmbeds = normalizeAllEmbeds;
		window.__jointPatches.wireNormalizeOnEmbed = wireNormalizeOnEmbed;

		return true;
	}

	// try immediately, otherwise poll until JointJS is available
	let tries = 0;
	function tryApply() {
		tries++;
		const ok = applyPatchOnce();
		if (ok) return;
		if (tries < MAX_RETRIES) {
			setTimeout(tryApply, RETRY_INTERVAL);
		} else {
			console.warn(
				"joint-patches: JointJS not available after retries, patch not applied",
			);
		}
	}

	tryApply();
})();
