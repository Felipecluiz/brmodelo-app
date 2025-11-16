import "backbone";
import $ from "jquery";

import * as joint from "jointjs/dist/joint";

import "../editor/editorManager";
import "../editor/editorScroller";
import "../editor/editorActions";
import "../editor/elementActions";
import "../editor/elementSelector";

import nosql from "../../joint/shapesNosql";
joint.shapes.nosql = nosql;

import angular from "angular";
import template from "./nosql.html";

import modelDuplicatorComponent from "../components/duplicateModelModal";
import shareModelModal from "../components/shareModelModal";
import statusBar from "../components/statusBar";

import KeyboardController, { types } from "../components/keyboardController";
import ToolsViewService from "../service/toolsViewService";
import preventExitServiceModule from "../service/preventExitService";
import iconConceptual from "../components/icons/conceptual";
import supportBannersList from "../components/supportBannersList";
const controller = function (
	ModelAPI,
	$stateParams,
	$rootScope,
	$timeout,
	$uibModal,
	$state,
	$transitions,
	preventExitService,
	$filter,
) {
	const ctrl = this;
	ctrl.modelState = {
		isDirty: false,
		updatedAt: new Date(),
	};
	ctrl.feedback = {
		message: "",
		showing: false,
	};
	ctrl.loading = true;
	ctrl.model = {
		id: "",
		name: "",
		type: "conceptual",
		model: "",
		user: $rootScope.loggeduser,
	};
	ctrl.selectedElement = {};
	const configs = {
		graph: {},
		paper: {},
		editorActions: {},
		keyboardController: null,
		selectedElementActions: null,
	};
	let selectedContainers = [];
	function _getContainerType(cell) {
		try {
			if (!cell) return null;
			if (typeof cell.get === "function") {
				const ct = cell.get("containerType");
				if (ct) return String(ct).toLowerCase().trim();
			}
			const attrs = cell && cell.attributes ? cell.attributes : {};
			if (attrs.containerType)
				return String(attrs.containerType).toLowerCase().trim();
			return null;
		} catch (e) {
			console.error(e);
			return null;
		}
	}

	function _getSupertypeToken(cell) {
		try {
			if (!cell) return null;
			if (typeof cell.get === "function") {
				const s = cell.get("supertype") || cell.get("type");
				if (s) return String(s).toLowerCase().trim();
			}
			const attrs = cell && cell.attributes ? cell.attributes : {};
			const cand = attrs.supertype || attrs.type;
			if (cand) return String(cand).toLowerCase().trim();
			return null;
		} catch (e) {
			console.error(e);
			return null;
		}
	}

	function isCollection(cell) {
		const ct = _getContainerType(cell);
		if (ct === "block") return false;
		if (ct === "collection" || ct === "colecao" || ct === "coleção")
			return true;
		const st = _getSupertypeToken(cell);
		if (!st) return false;
		return (
			st === "collection" ||
			st === "coleção" ||
			st === "colecao" ||
			st.indexOf("collection") !== -1
		);
	}

	function isBlock(cell) {
		const ct = _getContainerType(cell);
		if (ct === "collection" || ct === "colecao" || ct === "coleção")
			return false;
		if (ct === "block" || ct === "bloco") return true;
		const st = _getSupertypeToken(cell);
		if (!st) return false;
		if (st === "block" || st === "bloco" || st.indexOf("block") !== -1)
			return true;
		return false;
	}

	function hasAncestor(node, candidateAncestorId, graphRef) {
		if (!node || !candidateAncestorId || !graphRef) return false;
		try {
			let current = node;
			let depth = 0;
			while (current && depth < 100) {
				const p = current.get && current.get("parent");
				const pid = Array.isArray(p) ? p[0] : p;
				if (!pid) break;
				if (String(pid) === String(candidateAncestorId)) return true;
				current = graphRef.getCell && graphRef.getCell(pid);
				depth++;
			}
		} catch (e) {
			return false;
		}
		return false;
	}

	function safeEmbed(parent, child, graph) {
		if (!parent || !child) return;

		if (typeof hasAncestor === "function" && graph) {
			if (hasAncestor(parent, child.id, graph)) {
				console.warn(
					"[EMBED SKIPPED] would create cycle: parent is descendant of child",
					{
						parentId: parent.id,
						childId: child.id,
					},
				);
				return;
			}
		}

		let pRaw = null;
		try {
			pRaw = child.get && child.get("parent");
		} catch (e) {
			pRaw = null;
		}
		const currentParentId = Array.isArray(pRaw) ? pRaw[0] : pRaw;

		if (currentParentId && String(currentParentId) === String(parent.id))
			return;

		if (currentParentId && String(currentParentId) !== String(parent.id)) {
			try {
				const currentParent =
					graph && typeof graph.getCell === "function"
						? graph.getCell(currentParentId)
						: null;
				if (currentParent && typeof currentParent.unembed === "function") {
					currentParent.unembed(child);
					if (
						window.__jointPatches &&
						typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
					) {
						window.__jointPatches.normalizeEmbedsOfCell(currentParent);
					}
				} else if (currentParent && currentParent.get) {
					const raw = currentParent.get("embeds");
					if (Array.isArray(raw)) {
						const filtered = raw.filter((x) => {
							const id = x && x.id ? String(x.id) : String(x);
							return id && id !== String(child.id);
						});
						currentParent.set &&
							currentParent.set("embeds", filtered, { silent: true });
					} else {
						try {
							child.set && child.set("parent", null, { silent: true });
						} catch (_) {}
					}
				} else {
					try {
						child.set && child.set("parent", null, { silent: true });
					} catch (_) {}
				}
			} catch (e) {
				console.warn("safeEmbed: failed to unembed from previous parent", e);
			}
		}

		try {
			parent.embed(child);
			if (
				window.__jointPatches &&
				typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
			) {
				window.__jointPatches.normalizeEmbedsOfCell(parent);
			}
			return;
		} catch (err) {
			try {
				const nowParent = child.get && child.get("parent");
				const nowParentId = Array.isArray(nowParent) ? nowParent[0] : nowParent;
				if (nowParentId && String(nowParentId) === String(parent.id)) {
					return;
				}
			} catch (e) {
				console.error(e);
			}

			const msg = err && err.message ? err.message : String(err);
			if (
				msg.indexOf &&
				msg.indexOf("Embedding of already embedded cells") !== -1
			) {
				try {
					try {
						child.set && child.set("parent", null, { silent: true });
					} catch (e) {
						console.error(e);
					}
					const all =
						graph && typeof graph.getCells === "function"
							? graph.getCells()
							: [];
					const cid = String(child.id);
					for (let i = 0; i < all.length; i++) {
						const c = all[i];
						if (!c || !c.get) continue;
						const raw = c.get("embeds");
						if (!raw) continue;
						if (Array.isArray(raw)) {
							const filtered = raw.filter((x) => {
								const id = x && x.id ? String(x.id) : String(x);
								return id && id !== cid;
							});
							c.set && c.set("embeds", filtered, { silent: true });
						}
					}
					parent.embed(child);
					if (
						window.__jointPatches &&
						typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
					) {
						window.__jointPatches.normalizeEmbedsOfCell(parent);
					}
					return;
				} catch (err2) {
					console.warn("safeEmbed: re-embed attempt failed", err2);
					return;
				}
			}

			console.warn("safeEmbed: embed failed", err);
			return;
		}
	}
	const setIsDirty = (isDirty) => {
		ctrl.modelState.isDirty = isDirty;
	};

	ctrl.setLoading = (show) => {
		$timeout(() => {
			ctrl.loading = show;
		});
	};

	ctrl.showFeedback = (show, newMessage) => {
		$timeout(() => {
			ctrl.feedback.showing = show;
			ctrl.feedback.message = $filter("translate")(newMessage);
		});
	};

	ctrl.saveModel = () => {
		ctrl.modelState.updatedAt = new Date();
		setIsDirty(false);
		ctrl.setLoading(true);
		ctrl.model.model = JSON.stringify(configs.graph);
		ModelAPI.updateModel(ctrl.model).then(function (res) {
			ctrl.showFeedback(true, "Successfully saved!");
			ctrl.setLoading(false);
		});
	};

	ctrl.print = () => {
		window.print();
	};

	ctrl.undoModel = () => {
		configs.editorActions.undoNosql();
	};

	ctrl.redoModel = () => {
		configs.editorActions.redoNosql();
	};

	ctrl.zoomIn = () => {
		configs.editorScroller.zoom(0.1, { max: 2 });
	};

	ctrl.zoomOut = () => {
		configs.editorScroller.zoom(-0.1, { min: 0.2 });
	};

	ctrl.zoomNone = () => {
		configs.editorScroller.zoom();
	};

	ctrl.duplicateModel = (model) => {
		const modalInstance = $uibModal.open({
			animation: true,
			template:
				'<duplicate-model-modal suggested-name="$ctrl.suggestedName" close="$close(result)" dismiss="$dismiss(reason)"></duplicate-model-modal>',
			controller: function () {
				const $ctrl = this;
				$ctrl.suggestedName = $filter("translate")("MODEL_NAME (copy)", {
					name: model.name,
				});
			},
			controllerAs: "$ctrl",
		});
		modalInstance.result.then((newName) => {
			ctrl.setLoading(true);
			const duplicatedModel = {
				id: "",
				name: newName,
				type: model.type,
				model: model.model,
				user: model.who,
			};
			ModelAPI.saveModel(duplicatedModel).then((newModel) => {
				window.open($state.href("conceptual", { modelid: newModel._id }));
				ctrl.showFeedback(true, "Successfully duplicated!");
				ctrl.setLoading(false);
			});
		});
	};

	ctrl.duplicateModel = (model) => {
		const modalInstance = $uibModal.open({
			animation: true,
			template: `<duplicate-model-modal
						suggested-name="$ctrl.suggestedName"
						close="$close(result)"
						dismiss="$dismiss(reason)"
						user-id=$ctrl.userId
						model-id=$ctrl.modelId>
					</duplicate-model-modal>`,
			controller: function () {
				const $ctrl = this;
				$ctrl.suggestedName = $filter("translate")("MODEL_NAME (copy)", {
					name: model.name,
				});
				$ctrl.modelId = model._id;
				$ctrl.userId = model.who;
			},
			controllerAs: "$ctrl",
		}).result;
		modalInstance
			.then((newModel) => {
				window.open(
					$state.href("logic", { references: { modelid: newModel._id } }),
				);
				ctrl.showFeedback(true, "Successfully duplicated!");
			})
			.catch((error) => {
				console.error(error);
			});
	};
	
	ctrl.unselectAll = () => {
		ctrl.showFeedback(false, "");
		ctrl.onSelectElement(null);
		if (configs.selectedElementActions != null) {
			configs.selectedElementActions.remove();
			configs.selectedElementActions = null;
		}
	};

	ctrl.onUpdate = (event) => {
		if (event.type == "name") {
			ctrl.selectedElement.element.model.updateName(event.value);
		}
	};

	const registerPaperEvents = (paper) => {
		paper.on("blank:pointerdown", (evt) => {
			ctrl.unselectAll();
			if (!configs.keyboardController.spacePressed) {
				configs.elementSelector.start(evt);
			} else {
				configs.editorScroller.startPanning(evt);
			}
			configs.elementSelector.setCopyContext(evt);
		});

		paper.on("link:options", (cellView) => {
			ctrl.onSelectElement(cellView);
		});

		paper.on("element:pointerup", (cellView, evt, x, y) => {
			ctrl.onSelectElement(cellView);

			const defaultActions = joint.ui.ElementActions.prototype.options.actions;
			const actions = defaultActions.filter((a) =>
				["remove", "resize"].includes(a.name),
			);

			const elementActions = new joint.ui.ElementActions({
				cellView: cellView,
				boxContent: false,
				actions,
			});
			configs.selectedElementActions = elementActions;
			elementActions.render();

			try {
				const model = cellView.model;
				const resizeBtn =
					elementActions.el &&
					(elementActions.el.querySelector('[data-action="resize"]') ||
						elementActions.el.querySelector('.action[data-action="resize"]') ||
						elementActions.el.querySelector(".resize"));

				if (resizeBtn) {
					const onResizeMouseDown = (e) => {
						try {
							model.__manualResize = true;
							window.__currentlyManualResizingModelId = String(model.id);

							try {
								enforceMinSizeForModel(model);
							} catch (_) {}

							const clear = () => {
								setTimeout(() => {
									delete model.__manualResize;
									try {
										delete model.__enforcingMinSize;
									} catch (_) {}
									if (
										window.__currentlyManualResizingModelId === String(model.id)
									) {
										delete window.__currentlyManualResizingModelId;
									}
								}, 60);
								document.removeEventListener("mouseup", clear);
							};
							document.addEventListener("mouseup", clear);
						} catch (err) {
							console.warn("Failed to set manual resize flag", err);
						}
					};

					if (!elementActions.__onResizeMouseDown) {
						resizeBtn.addEventListener("mousedown", onResizeMouseDown);
						elementActions.__onResizeMouseDown = onResizeMouseDown;
					}
				}
			} catch (e) {
				console.warn(
					"Could not attach manual-resize marker to element actions",
					e,
				);
			}
		});
		paper.on("element:mouseover", function (cellView) {
			const model = cellView.model;
			const graph = configs.graph;
			let parents = [];
			try {
				parents = graph.findModelsUnderElement(model) || [];
			} catch (err) {
				console.warn(
					"safe: findModelsUnderElement failed, ignoring. modelId=",
					model && model.id,
					err,
				);
				parents = [];
			}
			if (!parents.length) return;

			const parent = parents[parents.length - 1];
			if (!parent) return;

			const modelId = model && model.id;
			const getParentId = () => {
				const p = model.get && model.get("parent");
				if (Array.isArray(p)) return p[0];
				return p;
			};

			const currentParentId = getParentId();

			function embedsContains(p, id) {
				if (!p || !id) return false;
				const raw = p.get && p.get("embeds");
				if (!raw) return false;
				if (Array.isArray(raw)) {
					return raw.some((x) =>
						x && x.id ? String(x.id) === String(id) : String(x) === String(id),
					);
				}
				if (raw && typeof raw.toArray === "function") {
					try {
						return raw
							.toArray()
							.some((x) =>
								x && x.id
									? String(x.id) === String(id)
									: String(x) === String(id),
							);
					} catch (e) {
						return false;
					}
				}
				if (typeof raw === "object") {
					return Object.keys(raw)
						.map((k) => raw[k])
						.some((v) =>
							v && v.id
								? String(v.id) === String(id)
								: String(v) === String(id),
						);
				}
				return String(raw) === String(id);
			}

			if (currentParentId && String(currentParentId) === String(parent.id))
				return;

			if (embedsContains(parent, modelId)) {
				try {
					if (
						window.__jointPatches &&
						typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
					) {
						window.__jointPatches.normalizeEmbedsOfCell(parent);
					} else {
						//remove modelId from parents embeds array if present
						const raw = parent.get && parent.get("embeds");
						if (Array.isArray(raw)) {
							const filtered = raw.filter((x) => {
								const id = x && x.id ? String(x.id) : String(x);
								return id && id !== String(modelId);
							});
							parent.set && parent.set("embeds", filtered, { silent: true });
						}
					}
				} catch (e) {
					console.warn(
						"Failed to normalize parent's embeds before embed attempt",
						e,
					);
				}

				// if still present, attempt unembed to clear inconsistent state
				if (embedsContains(parent, modelId)) {
					try {
						if (typeof parent.unembed === "function") {
							parent.unembed(model);
						} else {
							parent.set && parent.set("embeds", [], { silent: true });
						}
					} catch (e) {
						console.warn("Failed to unembed inconsistent entry from parent", e);
					}
				}
			}

			// If model currently belongs to a different parent, unembed it first
			if (currentParentId && String(currentParentId) !== String(parent.id)) {
				try {
					const currentParent = graph.getCell(currentParentId);
					if (currentParent && typeof currentParent.unembed === "function") {
						currentParent.unembed(model);
						if (
							window.__jointPatches &&
							typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
						) {
							window.__jointPatches.normalizeEmbedsOfCell(currentParent);
						}
					}
				} catch (e) {
					console.warn("Failed to unembed from previous parent", e);
				}
			}

			const finalParentId = getParentId();
			if (finalParentId && String(finalParentId) === String(parent.id)) return;
			if (embedsContains(parent, modelId)) return;

			safeEmbed(parent, model, graph);

			try {
				if (
					Array.isArray(parent.attributes.customAttributes) &&
					parent.attributes.customAttributes.length > 0
				) {
					parent.updateTable(parent.get("customAttributes") || []);
				} else if (typeof parent.realignChildrenInGrid === "function") {
					parent.realignChildrenInGrid();
				}
			} catch (e) {
				console.warn("Failed to update parent visuals after embed", e);
			}
		});

		paper.on("element:pointerdblclick", () => {
			$rootScope.$broadcast("command:openmenu");
		});

		configs.paper.on("link:mouseenter", (linkView) => {
			const conectionType = ctrl.shapeLinker.getConnectionTypeFromLink(
				linkView.model,
			);
			const toolsView = ctrl.toolsViewService.getToolsView(conectionType);
			linkView.addTools(toolsView);
		});

		configs.paper.on("link:mouseleave", (linkView) => {
			linkView.removeTools();
		});
		paper.on("element:pointerdown", function (cellView, evt) {
			if (cellView.model.attributes.supertype === "Collection") {
				if (evt.ctrlKey) {
					if (!selectedContainers.includes(cellView.model)) {
						selectedContainers.push(cellView.model);
						cellView.highlight("body");
					} else {
						selectedContainers = selectedContainers.filter(
							(c) => c !== cellView.model,
						);
						cellView.unhighlight("body");
					}
				} else {
					selectedContainers.forEach((c) => {
						const view = configs.paper.findViewByModel(c);
						if (view && typeof view.unhighlight === "function") {
							view.unhighlight("body");
						}
					});
					selectedContainers = [cellView.model];
					cellView.highlight("body");
				}
			}
		});
	};

	$("#mutualExclusionBtn").on("click", function () {
		selectedContainers = selectedContainers
			.filter(
				(c) =>
					c &&
					c.id &&
					configs.graph &&
					typeof configs.graph.getCell === "function" &&
					configs.graph.getCell(c.id),
			)
			.map((c) => configs.graph.getCell(c.id));

		if (selectedContainers.length < 2) {
			alert("Select at least two containers to merge!");
			return;
		}

		if (
			window.__jointPatches &&
			typeof window.__jointPatches.normalizeAllEmbeds === "function"
		) {
			try {
				window.__jointPatches.normalizeAllEmbeds(configs.graph);
			} catch (e) {
				console.warn(e);
			}
		}

		const braceCell = nosql.createMutualExclusionBrace(
			selectedContainers,
			configs.graph,
		);

		const selectedIds = selectedContainers.map((c) => String(c.id));

		const allCells = configs.graph.getCells();

		function getEmbeddedIdsFromCell(cell) {
			try {
				let embedded = [];
				if (typeof cell.getEmbeddedCells === "function") {
					embedded = cell.getEmbeddedCells() || [];
				} else {
					embedded = cell.get && cell.get("embeds") ? cell.get("embeds") : [];
				}

				if (Array.isArray(embedded)) {
					return embedded
						.map((e) =>
							e && e.id
								? String(e.id)
								: typeof e === "string" || typeof e === "number"
									? String(e)
									: null,
						)
						.filter(Boolean);
				}

				if (embedded && typeof embedded.toArray === "function") {
					try {
						return embedded
							.toArray()
							.map((e) =>
								e && e.id
									? String(e.id)
									: typeof e === "string" || typeof e === "number"
										? String(e)
										: null,
							)
							.filter(Boolean);
					} catch (err) {
						console.log(err);
					}
				}

				if (typeof embedded === "object") {
					return Object.keys(embedded)
						.map((k) => embedded[k])
						.map((v) =>
							v && v.id
								? String(v.id)
								: typeof v === "string" || typeof v === "number"
									? String(v)
									: null,
						)
						.filter(Boolean);
				}

				if (typeof embedded === "string" || typeof embedded === "number") {
					return [String(embedded)];
				}

				return [];
			} catch (e) {
				return [];
			}
		}

		const parentContainer = allCells.find((cell) => {
			try {
				const embeddedIds = getEmbeddedIdsFromCell(cell);
				if (!embeddedIds || embeddedIds.length === 0) return false;
				return selectedIds.every((id) => embeddedIds.includes(String(id)));
			} catch (e) {
				return false;
			}
		});

		if (!parentContainer) {
			console.warn(
				"No parent found for mutual exclusion. Aborting. Selected IDs:",
				selectedIds,
			);
			selectedContainers.forEach((cell) => {
				const v = configs.paper.findViewByModel(cell);
				if (v && typeof v.unhighlight === "function") v.unhighlight("body");
			});
			selectedContainers = [];
			alert("No common parent found for the selected containers.");
			return;
		}

		try {
			let mutuals = parentContainer.get("mutualExclusions");
			if (!Array.isArray(mutuals)) {
				mutuals = mutuals ? (Array.isArray(mutuals) ? mutuals : [mutuals]) : [];
			}

			const mutualEntry = {
				id: braceCell && braceCell.id ? braceCell.id : `me_${Date.now()}`,
				members: selectedContainers.map((c) => c.id),
				createdAt: new Date().toISOString(),
			};

			mutuals.push(mutualEntry);
			parentContainer.set("mutualExclusions", mutuals);
			parentContainer.set("mutualExclusionCount", mutuals.length);
		} catch (e) {
			console.error("Failed to update mutual exclusions on parent:", e);
		}

		selectedContainers.forEach((cell) => {
			const view = configs.paper.findViewByModel(cell);
			if (view && typeof view.unhighlight === "function")
				view.unhighlight("body");
		});
		selectedContainers = [];
	});
	const registerShortcuts = () => {
		configs.keyboardController.registerHandler(types.SAVE, () =>
			ctrl.saveModel(),
		);
		configs.keyboardController.registerHandler(types.UNDO, () =>
			ctrl.undoModel(),
		);
		configs.keyboardController.registerHandler(types.REDO, () =>
			ctrl.redoModel(),
		);
		configs.keyboardController.registerHandler(types.ZOOM_IN, () =>
			ctrl.zoomIn(),
		);
		configs.keyboardController.registerHandler(types.ZOOM_OUT, () =>
			ctrl.zoomOut(),
		);
		configs.keyboardController.registerHandler(types.ZOOM_NONE, () =>
			ctrl.zoomNone(),
		);
		configs.keyboardController.registerHandler(types.ESC, () =>
			ctrl.unselectAll(),
		);
		configs.keyboardController.registerHandler(types.COPY, () =>
			configs.elementSelector.copyAll(),
		);
		configs.keyboardController.registerHandler(types.PASTE, () =>
			configs.elementSelector.pasteAll(),
		);
		configs.keyboardController.registerHandler(types.DELETE, () =>
			configs.elementSelector.deleteAll(),
		);
	};

	const registerGraphEvents = (graph) => {
		graph.on("change", () => {
			setIsDirty(true);
		});

		graph.on("remove", () => {
			setIsDirty(true);
		});

		graph.on("change:position", function (cell) {});
		configs.graph.on("change:size", function (model) {
			if (!model) return;

			if (model.__minSizeTimeout) clearTimeout(model.__minSizeTimeout);
			model.__minSizeTimeout = setTimeout(() => {
				try {
					if (
						model.__manualResize ||
						(window.__currentlyManualResizingModelId &&
							String(window.__currentlyManualResizingModelId) ===
								String(model.id))
					) {
						enforceMinSizeForModel(model);
					}
					try {
						let current = model;
						let depth = 0;
						while (current && depth < 50) {
							const pRaw = current.get && current.get("parent");
							const parentId = Array.isArray(pRaw) ? pRaw[0] : pRaw;
							if (!parentId) break;
							const parent =
								configs.graph && typeof configs.graph.getCell === "function"
									? configs.graph.getCell(parentId)
									: null;
							if (!parent) break;

							if (
								parent.__manualResize ||
								(window.__currentlyManualResizingModelId &&
									String(window.__currentlyManualResizingModelId) ===
										String(parent.id))
							) {
								enforceMinSizeForModel(parent);
								break;
							}
							current = parent;
							depth++;
						}
					} catch (e) {
						console.warn("Failed to enforce min size on ancestors", e);
					}

					try {
						const children =
							typeof model.getEmbeddedCells === "function"
								? model.getEmbeddedCells() || []
								: [];
						for (let i = 0; i < children.length; i++) {
							const ch = children[i];
							if (!ch) continue;
							if (
								ch.__manualResize ||
								(window.__currentlyManualResizingModelId &&
									String(window.__currentlyManualResizingModelId) ===
										String(ch.id))
							) {
								enforceMinSizeForModel(model);
								break;
							}
						}
					} catch (e) {}
				} finally {
					clearTimeout(model.__minSizeTimeout);
					delete model.__minSizeTimeout;
				}
			}, 25);
		});
		graph.on("add", (model) => {
			setIsDirty(true);
			if (!model || model instanceof joint.dia.Link) return;
			if (configs._suppressAddChecks) return;
			if (typeof isBlock !== "function" || !isBlock(model)) return;

			const p = model.get && model.get("parent");
			const parentId = Array.isArray(p) ? p[0] : p;
			if (parentId) return;

			if (model.__validatingAdd) return;
			model.__validatingAdd = true;

			setTimeout(() => {
				try {
					if (
						!configs.graph ||
						!configs.graph.getCell ||
						!configs.graph.getCell(model.id)
					) {
						delete model.__validatingAdd;
						return;
					}

					const tryFindParents = () => {
						if (
							!configs.graph ||
							typeof configs.graph.findModelsUnderElement !== "function"
						)
							return null;
						try {
							const parents = configs.graph.findModelsUnderElement(model) || [];
							return parents.length ? parents[parents.length - 1] : null;
						} catch (e) {
							return null;
						}
					};

					const candidateFromFind = tryFindParents();
					if (candidateFromFind) {
						const ok =
							typeof canEmbedBasedOnTypes === "function"
								? canEmbedBasedOnTypes(model, candidateFromFind, configs.graph)
								: typeof isCollection === "function" &&
									isCollection(candidateFromFind);
						if (ok) {
							candidateFromFind.embed(model);
							if (
								window.__jointPatches &&
								typeof window.__jointPatches.normalizeEmbedsOfCell ===
									"function"
							) {
								window.__jointPatches.normalizeEmbedsOfCell(candidateFromFind);
							}
							delete model.__validatingAdd;
							return;
						}
					}

					const pos = model.get && model.get("position");
					const size = model.get && model.get("size");
					if (pos) {
						const cx = pos.x + (size && size.width ? size.width / 2 : 0);
						const cy = pos.y + (size && size.height ? size.height / 2 : 0);
						const all =
							configs.graph && typeof configs.graph.getCells === "function"
								? configs.graph.getCells()
								: [];
						for (let i = 0; i < all.length; i++) {
							const col = all[i];
							if (
								!col ||
								typeof isCollection !== "function" ||
								!isCollection(col)
							)
								continue;
							const colPos = col.get && col.get("position");
							const colSize = col.get && col.get("size");
							if (!colPos || !colSize) continue;
							const left = colPos.x;
							const top = colPos.y;
							const right = colPos.x + (colSize.width || 0);
							const bottom = colPos.y + (colSize.height || 0);
							if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
								col.embed(model);
								if (
									window.__jointPatches &&
									typeof window.__jointPatches.normalizeEmbedsOfCell ===
										"function"
								) {
									window.__jointPatches.normalizeEmbedsOfCell(col);
								}
								delete model.__validatingAdd;
								return;
							}
						}
					}

					const isActuallyOrphan = (() => {
						const pp = model.get && model.get("parent");
						if (pp && (Array.isArray(pp) ? pp[0] : pp)) return false;

						const idStr = String(model.id);
						const cells =
							configs.graph && typeof configs.graph.getCells === "function"
								? configs.graph.getCells()
								: [];
						for (let j = 0; j < cells.length; j++) {
							const c = cells[j];
							if (!c || !c.get) continue;
							if (typeof c.getEmbeddedCells === "function") {
								try {
									const em = c.getEmbeddedCells() || [];
									if (
										em.some((e) =>
											e && e.id ? String(e.id) === idStr : String(e) === idStr,
										)
									)
										return false;
								} catch (e) {
									console.error(e);
								}
							}
							try {
								const raw = c.get && c.get("embeds");
								if (!raw) continue;
								if (
									Array.isArray(raw) &&
									raw.some((x) =>
										x && x.id ? String(x.id) === idStr : String(x) === idStr,
									)
								)
									return false;
								if (raw && typeof raw.toArray === "function") {
									try {
										if (
											raw
												.toArray()
												.some((x) =>
													x && x.id
														? String(x.id) === idStr
														: String(x) === idStr,
												)
										)
											return false;
									} catch (e) {}
								}
								if (typeof raw === "object") {
									const vals = Object.keys(raw).map((k) => raw[k]);
									if (
										vals.some((v) =>
											v && v.id ? String(v.id) === idStr : String(v) === idStr,
										)
									)
										return false;
								}
								if (String(raw) === idStr) return false;
							} catch (e) {}
						}

						if (
							configs.graph &&
							typeof configs.graph.findModelsUnderElement === "function"
						) {
							try {
								const parents =
									configs.graph.findModelsUnderElement(model) || [];
								if (parents && parents.length) return false;
							} catch (e) {}
						}

						try {
							if (pos) {
								const all2 =
									configs.graph && typeof configs.graph.getCells === "function"
										? configs.graph.getCells()
										: [];
								for (let k = 0; k < all2.length; k++) {
									const col = all2[k];
									if (
										!col ||
										typeof isCollection !== "function" ||
										!isCollection(col)
									)
										continue;
									const colPos = col.get && col.get("position");
									const colSize = col.get && col.get("size");
									if (!colPos || !colSize) continue;
									const left = colPos.x;
									const top = colPos.y;
									const right = colPos.x + (colSize.width || 0);
									const bottom = colPos.y + (colSize.height || 0);
									if (cx >= left && cx <= right && cy >= top && cy <= bottom)
										return false;
								}
							}
						} catch (e) {}

						return true;
					})();

					if (!isActuallyOrphan) {
						delete model.__validatingAdd;
						return;
					}

					if (typeof ctrl.showFeedback === "function") {
						ctrl.showFeedback(
							true,
							"Um bloco não pode existir sozinho e foi removido.",
						);
						setTimeout(() => {
							try {
								ctrl.showFeedback(false, "");
							} catch (e) {}
						}, 3000);
					}
					if (
						configs.graph &&
						typeof configs.graph.removeCells === "function"
					) {
						configs.graph.removeCells([model]);
					} else if (typeof model.remove === "function") {
						model.remove();
					}
				} finally {
					delete model.__validatingAdd;
				}
			}, 80);
		});
	};
	function computeMinSizeFromModel(model) {
		if (!model) return { width: 0, height: 0 };

		const defaultTableX = typeof tableX !== "undefined" ? tableX : 20;
		const defaultTableBgWidth =
			typeof attrs !== "undefined" && attrs.tableBg && attrs.tableBg.width
				? attrs.tableBg.width
				: 200;
		const defaultTableY = typeof tableY !== "undefined" ? tableY : 20;
		const defaultHeaderHeight =
			typeof headerHeight !== "undefined" ? headerHeight : 30;
		const defaultCellHeight =
			typeof cellHeight !== "undefined" ? cellHeight : 30;
		const defaultPadding = 12;
		const defaultBorder = 2;

		try {
			const a =
				(typeof model.get === "function" && model.get("attrs")) ||
				(model.attributes && model.attributes.attrs) ||
				{};

			let tableBgWidth = defaultTableBgWidth;
			if (a && a.tableBg) {
				const w = a.tableBg.width || a.tableBg["width"];
				if (typeof w === "number" && w > 0) tableBgWidth = w;
				else if (typeof w === "string" && !isNaN(parseFloat(w)))
					tableBgWidth = parseFloat(w);
			}
			let tx = defaultTableX;
			if (a && a.tableBg) {
				const x = a.tableBg.x || a.tableBg["x"];
				if (typeof x === "number") tx = x;
				else if (typeof x === "string" && !isNaN(parseFloat(x)))
					tx = parseFloat(x);
			}
			const requiredWidth = Math.ceil(
				tx + tableBgWidth + defaultPadding + defaultBorder,
			);

			let attributesCount = 0;
			try {
				const attrsList = model.get && model.get("customAttributes");
				if (Array.isArray(attrsList)) attributesCount = attrsList.length;
				else if (attrsList && typeof attrsList === "object")
					attributesCount = Object.keys(attrsList).length;
			} catch (e) {
				attributesCount = 0;
			}
			const maxRows = typeof MAX_ROWS !== "undefined" ? MAX_ROWS : 50;
			const visibleRows = Math.min(attributesCount, maxRows);
			const requiredHeight = Math.ceil(
				defaultHeaderHeight +
					defaultTableY +
					visibleRows * defaultCellHeight +
					defaultPadding +
					defaultBorder,
			);

			const minHeaderOnly = defaultHeaderHeight + defaultPadding;
			return {
				width: Math.max(requiredWidth, minHeaderOnly),
				height: Math.max(requiredHeight, minHeaderOnly),
			};
		} catch (e) {
			console.warn("computeMinSizeFromModel failed", e);
			return {
				width: Math.ceil(
					defaultTableX + defaultTableBgWidth + defaultPadding + defaultBorder,
				),
				height: Math.ceil(
					defaultHeaderHeight +
						defaultTableY +
						3 * defaultCellHeight +
						defaultPadding +
						defaultBorder,
				),
			};
		}
	}

	function enforceMinSizeForModel(model) {
		if (!model || !configs || !configs.paper) return;
		if (!model.__manualResize) return;
		if (model.__enforcingMinSize) return;
		model.__enforcingMinSize = true;

		setTimeout(() => {
			try {
				const view = configs.paper.findViewByModel(model);
				const size =
					model.get && model.get("size")
						? model.get("size")
						: { width: 0, height: 0 };
				const currentWidth =
					size.width ||
					(view && view.el && view.el.getBoundingClientRect
						? view.el.getBoundingClientRect().width
						: 0);
				const currentHeight =
					size.height ||
					(view && view.el && view.el.getBoundingClientRect
						? view.el.getBoundingClientRect().height
						: 0);

				const required = computeMinSizeFromModel(model);
				const needWidth = required.width > currentWidth;
				const needHeight = required.height > currentHeight;

				if (needWidth || needHeight) {
					const newSize = {
						width: needWidth ? required.width : size.width,
						height: needHeight ? required.height : size.height,
					};
					if (newSize.width !== size.width || newSize.height !== size.height) {
						model.set("size", newSize);
					}
				}
			} catch (err) {
				console.warn("enforceMinSizeForModel error", err);
			} finally {
				setTimeout(() => {
					delete model.__enforcingMinSize;
				}, 40);
			}
		}, 16);
	}
	const buildWorkspace = () => {
		configs.graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes });

		registerGraphEvents(configs.graph);

		const content = $("#content");

		configs.paper = new joint.dia.Paper({
			width: content.width(),
			height: content.height(),
			gridSize: 10,
			drawGrid: true,
			model: configs.graph,
			linkConnectionPoint: joint.util.shapePerimeterConnectionPoint,
			cellViewNamespace: joint.shapes,
			linkPinning: false,
			views: {
				"nosql.Collection": joint.shapes.custom.ContainerView,
			},
		});
		ctrl.paper = configs.paper;
		(function () {
			if (!window.joint || !joint.dia || !joint.dia.Cell) return;
			if (window.__embed_guard_installed) return;
			window.__embed_guard_installed = true;

			const origEmbed = joint.dia.Cell.prototype.embed;

			function _idOf(cell) {
				try {
					return cell && (cell.id || (cell.get && cell.get("id")));
				} catch (e) {
					return undefined;
				}
			}

			joint.dia.Cell.prototype.embed = function (child) {
				const callee = this;
				const arg = child;
				const graphRef =
					typeof configs !== "undefined" && configs && configs.graph
						? configs.graph
						: this.graph || window.__embedGraph || null;

				try {
					const calleeParentRaw =
						callee && callee.get ? callee.get("parent") : null;
					const calleeParentId = Array.isArray(calleeParentRaw)
						? calleeParentRaw[0]
						: calleeParentRaw;

					const argParentRaw = arg && arg.get ? arg.get("parent") : null;
					const argParentId = Array.isArray(argParentRaw)
						? argParentRaw[0]
						: argParentRaw;

					if (
						calleeParentId &&
						arg &&
						arg.id &&
						String(calleeParentId) === String(arg.id)
					) {
						return this;
					}

					if (
						argParentId &&
						callee &&
						callee.id &&
						String(argParentId) === String(callee.id)
					) {
						console.warn(
							"[EMBED GUARD] blocked: would create cycle (arg parent equals callee)",
							callee.id,
							arg && arg.id,
						);
						return this;
					}

					if (!arg || !arg.id) {
						return origEmbed.apply(this, arguments);
					}

					if (typeof isCollection === "function" && isCollection(arg)) {
						console.warn(
							"[EMBED GUARD] blocked: child is collection",
							arg && arg.id,
						);
						return this;
					}
					if (
						typeof isCollection === "function" &&
						isCollection(callee) &&
						isCollection(arg)
					) {
						console.warn(
							"[EMBED GUARD] blocked: collection inside collection",
							callee && callee.id,
							arg && arg.id,
						);
						return this;
					}
					if (
						typeof isBlock === "function" &&
						isBlock(arg) &&
						isBlock(callee)
					) {
						if (typeof hasCollectionAncestor === "function" && graphRef) {
							if (!hasCollectionAncestor(callee, graphRef)) {
								console.warn(
									"[EMBED GUARD] blocked: block->block (parent lacks Collection ancestor)",
									callee && callee.id,
									arg && arg.id,
								);
								return this;
							}
						}
					}

					try {
						return origEmbed.apply(this, arguments);
					} catch (err) {
						const msg = err && err.message ? err.message : String(err);

						try {
							const nowParentRaw = arg && arg.get ? arg.get("parent") : null;
							const nowParentId = Array.isArray(nowParentRaw)
								? nowParentRaw[0]
								: nowParentRaw;
							if (nowParentId && String(nowParentId) === String(arg.id)) {
								return this;
							}
							const childNowParentRaw =
								callee && callee.get ? callee.get("parent") : null;
							const childNowParentId = Array.isArray(childNowParentRaw)
								? childNowParentRaw[0]
								: childNowParentRaw;
							if (
								childNowParentId &&
								arg &&
								arg.id &&
								String(childNowParentId) === String(arg.id)
							) {
								return this;
							}
						} catch (ignore) {}

						if (
							msg.indexOf &&
							msg.indexOf("Embedding of already embedded cells") !== -1
						) {
							try {
								if (typeof arg.embed === "function" && arg !== callee) {
									try {
										try {
											const childParentRaw =
												callee && callee.get ? callee.get("parent") : null;
											const childParentId = Array.isArray(childParentRaw)
												? childParentRaw[0]
												: childParentRaw;
											if (
												childParentId &&
												graphRef &&
												typeof graphRef.getCell === "function"
											) {
												const prevParent = graphRef.getCell(childParentId);
												if (
													prevParent &&
													typeof prevParent.unembed === "function"
												) {
													prevParent.unembed(callee);
													if (
														window.__jointPatches &&
														typeof window.__jointPatches
															.normalizeEmbedsOfCell === "function"
													) {
														window.__jointPatches.normalizeEmbedsOfCell(
															prevParent,
														);
													}
												}
											}
										} catch (_) {}
										arg.embed(callee);
										if (
											window.__jointPatches &&
											typeof window.__jointPatches.normalizeEmbedsOfCell ===
												"function"
										) {
											window.__jointPatches.normalizeEmbedsOfCell(arg);
										}
										return this;
									} catch (err2) {
										console.warn(
											"[EMBED GUARD] inverse embed attempt failed",
											err2,
										);
									}
								}
							} catch (e2) {}
						}

						console.warn(
							"[EMBED GUARD] embed call failed and was normalized (returning).",
							err,
						);
						return this;
					}
				} catch (outerErr) {
					try {
						return origEmbed.apply(this, arguments);
					} catch (e) {
						return this;
					}
				}
			};

			window.__restore_orig_embed = function () {
				try {
					if (origEmbed) joint.dia.Cell.prototype.embed = origEmbed;
					window.__embed_guard_installed = false;
					delete window.__restore_orig_embed;
					console.info("Embed guard removed; original embed restored");
				} catch (e) {
					console.error("Failed to restore embed", e);
				}
			};

			console.info("Robust embed guard installed");
		})();
		let refModeActive = false;
		let selectedReferenceCollection = null;

		document.getElementById("refAttributeBtn").onclick = function () {
			refModeActive = true;
			selectedReferenceCollection = null;
			alert("Selecione a coleção a ser referenciada");
		};

		configs.graph.on("remove", function (model) {
			try {
				if (!model) return;
				if (model instanceof joint.dia.Link) return;

				try {
					if (typeof setIsDirty === "function") setIsDirty(true);
				} catch (e) {}

				const removedId = String(model.id);

				const all =
					typeof configs.graph.getCells === "function"
						? configs.graph.getCells()
						: [];
				for (let i = 0; i < all.length; i++) {
					const cell = all[i];
					if (
						!cell ||
						typeof cell.get !== "function" ||
						typeof cell.set !== "function"
					)
						continue;

					const rawMutuals = cell.get("mutualExclusions");
					if (!rawMutuals) continue;

					const mutuals = Array.isArray(rawMutuals)
						? rawMutuals.slice()
						: [rawMutuals];
					let changed = false;
					const remaining = [];

					for (let j = 0; j < mutuals.length; j++) {
						const entry = mutuals[j];
						if (!entry || !entry.members) {
							remaining.push(entry);
							continue;
						}

						const members = Array.isArray(entry.members)
							? entry.members.map((m) => String(m))
							: typeof entry.members === "string" ||
								  typeof entry.members === "number"
								? [String(entry.members)]
								: [];

						if (members.indexOf(removedId) !== -1) {
							try {
								if (entry.id) {
									const brace = configs.graph.getCell(entry.id);
									if (brace) {
										if (typeof configs.graph.removeCells === "function") {
											configs.graph.removeCells([brace]);
										} else if (typeof brace.remove === "function") {
											brace.remove();
										}
									}
								}
							} catch (e) {
								console.warn(
									"Failed to remove mutual-exclusion brace for entry",
									entry,
									e,
								);
							}
							changed = true;
						} else {
							remaining.push(entry);
						}
					}

					if (changed) {
						try {
							cell.set("mutualExclusions", remaining, { silent: true });
							cell.set("mutualExclusionCount", remaining.length, {
								silent: true,
							});
						} catch (e) {
							try {
								cell.set("mutualExclusions", remaining);
								cell.set("mutualExclusionCount", remaining.length);
							} catch (_) {}
						}

						try {
							if (typeof cell.updateTable === "function") {
								cell.updateTable(cell.get("customAttributes") || []);
							} else if (typeof cell.realignChildrenInGrid === "function") {
								cell.realignChildrenInGrid();
							}
						} catch (e) {
							console.warn(
								"Failed to refresh container visual after removing mutual entry",
								e,
							);
						}
					}
				}
			} catch (err) {
				console.error("Error handling graph remove for mutual exclusions", err);
			}
		});

		configs.paper.on("element:pointerup", function (cellView) {
			if (!refModeActive) return;

			const model = cellView.model;
			if (!model) return;

			if (!selectedReferenceCollection) {
				if (typeof isCollection === "function" && !isCollection(model)) {
					alert(
						"Selecione uma coleção como origem do atributo de referência (não um bloco).",
					);
					return;
				}
				selectedReferenceCollection = model;
				alert(
					"Origem selecionada. Agora selecione a coleção que receberá o atributo de referência.",
				);
				return;
			}

			const collectionDestination = model;
			if (
				typeof isCollection === "function" &&
				!isCollection(collectionDestination)
			) {
				alert(
					"O atributo de referência só pode ser adicionado a coleções. Selecione uma coleção como destino.",
				);
				return;
			}

			const sourceName =
				selectedReferenceCollection.attr &&
				selectedReferenceCollection.attr("headerText/text")
					? selectedReferenceCollection.attr("headerText/text")
					: selectedReferenceCollection.get &&
						(selectedReferenceCollection.get("name") ||
							selectedReferenceCollection.id);

			const refAttribute = {
				name: "ref_" + String(sourceName).replace(/\s+/g, "_"),
				type: "reference",
				targetCollectionId: selectedReferenceCollection.id,
				targetCollectionName: String(sourceName),
			};

			const attributes = collectionDestination.get("customAttributes") || [];
			const already = attributes.some(
				(a) =>
					a &&
					(a.name === refAttribute.name ||
						a.targetCollectionId === refAttribute.targetCollectionId),
			);
			if (already) {
				alert("Atributo de referência já existe nesta coleção.");
				refModeActive = false;
				selectedReferenceCollection = null;
				return;
			}

			attributes.push(refAttribute);
			collectionDestination.set("customAttributes", attributes);

			if (typeof collectionDestination.updateTable === "function") {
				collectionDestination.updateTable(attributes);
			} else if (
				typeof collectionDestination.realignChildrenInGrid === "function"
			) {
				collectionDestination.realignChildrenInGrid();
			}

			refModeActive = false;
			selectedReferenceCollection = null;
			alert("Atributo de referência criado!");
		});
		function bringDescendantsToFront(parent) {
			try {
				if (!parent || !configs || !configs.paper || !configs.graph) return;

				if (
					window.__jointPatches &&
					typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
				) {
					try {
						window.__jointPatches.normalizeEmbedsOfCell(parent);
					} catch (e) {
						console.warn(
							"bringDescendantsToFront: normalizeEmbedsOfCell failed",
							e,
						);
					}
				}

				function getImmediateChildren(cell) {
					let raw = [];
					try {
						if (typeof cell.getEmbeddedCells === "function") {
							raw = cell.getEmbeddedCells() || [];
						} else {
							raw = cell.get && cell.get("embeds") ? cell.get("embeds") : [];
						}
					} catch (e) {
						raw = cell.get && cell.get("embeds") ? cell.get("embeds") : [];
					}
					if (Array.isArray(raw)) {
						return raw
							.map((r) =>
								r && r.id
									? r
									: typeof r === "string" || typeof r === "number"
										? configs.graph.getCell(String(r))
										: r,
							)
							.filter(Boolean);
					}
					if (raw && typeof raw.toArray === "function") {
						try {
							return raw
								.toArray()
								.map((r) =>
									r && r.id
										? r
										: typeof r === "string" || typeof r === "number"
											? configs.graph.getCell(String(r))
											: r,
								)
								.filter(Boolean);
						} catch (e) {
							return [];
						}
					}
					if (typeof raw === "object") {
						return Object.keys(raw)
							.map((k) => raw[k])
							.map((r) =>
								r && r.id
									? r
									: typeof r === "string" || typeof r === "number"
										? configs.graph.getCell(String(r))
										: r,
							)
							.filter(Boolean);
					}
					if (typeof raw === "string" || typeof raw === "number") {
						const c = configs.graph.getCell(String(raw));
						return c ? [c] : [];
					}
					return [];
				}

				const nodes = [];
				const queue = [];
				nodes.push(parent);
				queue.push(parent);

				while (queue.length) {
					const cur = queue.shift();
					const children = getImmediateChildren(cur);
					for (let i = 0; i < children.length; i++) {
						const ch = children[i];
						// normalize child embeds too before exploring
						if (
							window.__jointPatches &&
							typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
						) {
							try {
								window.__jointPatches.normalizeEmbedsOfCell(ch);
							} catch (e) {}
						}
						nodes.push(ch);
						queue.push(ch);
					}
				}

				if (!nodes.length) return;

				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						nodes.forEach((n) => {
							try {
								const view = configs.paper.findViewByModel
									? configs.paper.findViewByModel(n)
									: null;
								if (view && typeof view.toFront === "function") {
									view.toFront();
								} else if (n && typeof n.toFront === "function") {
									n.toFront();
								}
							} catch (e) {
								console.warn(
									"bringDescendantsToFront: child toFront failed",
									e,
								);
							}
						});
					});
				});
			} catch (err) {
				console.warn("bringDescendantsToFront error", err);
			}
		}
		ctrl.onSelectElement = (cellView) => {
			if (cellView != null) {
				configs.elementSelector.cancel();

				$timeout(() => {
					const model = cellView.model;

					try {
						if (model && typeof model.get === "function") {
							const rawEmbeds = model.get("embeds");
							if (rawEmbeds && !Array.isArray(rawEmbeds)) {
								if (
									window.__jointPatches &&
									typeof window.__jointPatches.normalizeEmbedsOfCell ===
										"function"
								) {
									try {
										window.__jointPatches.normalizeEmbedsOfCell(model);
									} catch (e) {
										console.warn(
											"onSelectElement: normalizeEmbedsOfCell failed",
											e,
										);
									}
								} else if (
									typeof rawEmbeds === "string" ||
									typeof rawEmbeds === "number" ||
									(rawEmbeds && rawEmbeds.id)
								) {
									model.set(
										"embeds",
										Array.isArray(rawEmbeds) ? rawEmbeds : [rawEmbeds],
										{ silent: true },
									);
								}
							}
						}
					} catch (err) {
						console.warn("onSelectElement: failed to normalize embeds", err);
					}

					const view = configs.paper.findViewByModel(model);
					if (view && typeof view.toFront === "function") {
						view.toFront();
					} else {
						try {
							model.toFront();
						} catch (e) {}
					}
					bringDescendantsToFront(model);

					ctrl.selectedElement = {
						model: model,
						value: model.attributes?.attrs?.headerText?.text,
						type: model.attributes?.supertype,
						element: cellView,
					};
				}, 40);
				return;
			}

			$timeout(() => {
				ctrl.selectedElement = {
					value: "",
					type: "blank",
					element: null,
				};
			});
		};
		configs.keyboardController = new KeyboardController(
			configs.paper.$document,
		);

		registerPaperEvents(configs.paper);

		configs.editorScroller = new joint.ui.EditorScroller({
			paper: configs.paper,
			cursor: "grabbing",
			autoResizePaper: true,
		});
		content.append(configs.editorScroller.render().el);

		const enditorManager = new joint.ui.EditorManager({
			graph: configs.graph,
			paper: configs.paper,
		});

		configs.editorActions = new joint.ui.EditorActions({
			graph: configs.graph,
			paper: configs.paper,
		});

		$(".elements-holder").append(enditorManager.render().el);

		configs.elementSelector = new joint.ui.ElementSelector({
			paper: configs.paper,
			graph: configs.graph,
			model: new Backbone.Collection(),
		});

		const containerParent = new joint.shapes.nosql.Collection({
			size: { width: 100, height: 100 },
			z: 1,
			position: { x: 10, y: 10 },
			attrs: {
				headerText: { text: "Coleção" },
				customText: { text: "" },
			},
			customAttributes: [],
		});
		const containerBlock = new joint.shapes.nosql.Collection({
			size: { width: 100, height: 100 },
			z: 1,
			position: { x: 10, y: 150 },
			attrs: {
				headerText: { text: "Bloco" },
				customText: { text: "" },
			},
			customAttributes: [],
			containerType: "block",
		});
		enditorManager.loadElements([containerParent, containerBlock]);

		registerShortcuts();
	};

	ctrl.$postLink = () => {
		buildWorkspace();
	};
	ctrl.addAttributeHandler = function (args) {
		const attributeName = args.name;
		const attributeType = args.type;
		const element = args.element;
		if (!attributeName || !attributeType || !element) {
			console.warn("Incomplete data");
			return;
		}
		const customAttributes = element.get("customAttributes") || [];
		customAttributes.push({ name: attributeName, type: attributeType });
		element.set("customAttributes", customAttributes);

		if (typeof element.updateTable === "function") {
			element.updateTable(customAttributes);
		} else {
			console.warn("updateTable doesn't exists!", element);
		}

		if (configs.paper && configs.paper.draw) configs.paper.draw();

		ctrl.newAttributeName = "";
		ctrl.newAttributeType = "";
	};

	ctrl.$onInit = () => {
		ctrl.toolsViewService = new ToolsViewService();
		ctrl.setLoading(true);

		ModelAPI.getModel($stateParams.modelid, $rootScope.loggeduser)
			.then((resp) => {
				const jsonModel =
					typeof resp.data.model === "string"
						? JSON.parse(resp.data.model)
						: resp.data.model;

				ctrl.model = resp.data;
				ctrl.model.id = resp.data._id;
				ctrl.model.model = jsonModel;

				configs.graph.fromJSON(jsonModel);
				if (window.__jointPatches) {
					try {
						window.__jointPatches.normalizeAllEmbeds(configs.graph);
					} catch (e) {}
					try {
						window.__jointPatches.wireNormalizeOnEmbed(configs.graph);
					} catch (e) {}
				}
				const selectedId = ctrl.selectedElement?.model?.id;

				ctrl.graph = configs.graph;

				if (selectedId) {
					const realElement = ctrl.graph.getCell(selectedId);
					if (realElement) {
						ctrl.selectedElement.model = realElement;
						const customAttributes = realElement.get("customAttributes") || [];
						const allAttributeNames = customAttributes
							.map((attr) => attr.name)
							.join(", ");
						realElement.attr("customText/text", allAttributeNames);
					} else {
						console.warn("Element with ID", selectedId, "not found in graph.");
					}
				}
				ctrl.setLoading(false);
			})
			.catch((error) => {
				if (error.status === 404 || error.status === 401) {
					$state.go("noaccess");
				}
				console.error(error);

				ctrl.setLoading(false);
			});
	};
	window.onbeforeunload = preventExitService.handleBeforeUnload(ctrl);
	const onBeforeDeregister = $transitions.onBefore(
		{},
		preventExitService.handleTransitionStart(ctrl, "conceptual"),
	);
	const onExitDeregister = $transitions.onExit(
		{},
		preventExitService.cleanup(ctrl),
	);

	ctrl.$onDestroy = () => {
		configs.graph = null;
		configs.paper = null;
		configs.keyboardController.unbindAll();
		configs.keyboardController = null;
		preventExitService.cleanup(ctrl)();
		onBeforeDeregister();
		onExitDeregister();
	};
};

export default angular
	.module("app.workspace.nosql", [
		modelDuplicatorComponent,
		preventExitServiceModule,
		statusBar,
		shareModelModal,
		iconConceptual,
		supportBannersList,
	])
	.component("editorNoSQL", {
		template,
		controller,
	}).name;
