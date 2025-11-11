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

	ctrl.convertModel = (conceptualModel) => {
		const model = {
			name: conceptualModel.name + $filter("translate")("_converted"),
			user: $rootScope.loggeduser,
			type: "logic",
			model: '{"cells":[]}',
		};
		ModelAPI.saveModel(model).then((newModel) => {
			window.open(
				$state.href("logic", {
					references: {
						modelid: newModel._id,
						conversionId: conceptualModel._id,
					},
				}),
				"_blank",
			);
		});
	};

	ctrl.shareModel = (model) => {
		const modalInstance = $uibModal.open({
			animation: true,
			backdrop: "static",
			keyboard: false,
			template:
				'<share-model-modal close="$close(result)" dismiss="$dismiss()" model-id="$ctrl.modelId"></share-model-modal>',
			controller: function () {
				const $ctrl = this;
				$ctrl.modelId = model._id;
			},
			controllerAs: "$ctrl",
		}).result;
		modalInstance
			.then(() => {
				ctrl.showFeedback(
					true,
					$filter("translate")(
						"Sharing configuration has been updated successfully!",
					),
				);
			})
			.catch((reason) => {
				console.log("Modal dismissed with reason", reason);
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

			// If already consistent, nothing to do
			if (currentParentId && String(currentParentId) === String(parent.id))
				return;

			// If parent claims to embed the model but model disagrees -> try to normalize/fix
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

			// Safe to embed
			try {
				parent.embed(model);
				if (
					window.__jointPatches &&
					typeof window.__jointPatches.normalizeEmbedsOfCell === "function"
				) {
					window.__jointPatches.normalizeEmbedsOfCell(parent);
				}
			} catch (e) {
				console.warn("embed failed (ignored):", e);
				try {
					if (
						window.__jointPatches &&
						typeof window.__jointPatches.normalizeAllEmbeds === "function"
					) {
						window.__jointPatches.normalizeAllEmbeds(graph);
					}
				} catch (_) {}
				return;
			}

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

		// get all cells once
		const allCells = configs.graph.getCells();

		// extract embedded ids from a parent cell in many shapes
		function getEmbeddedIdsFromCell(cell) {
			try {
				let embedded = [];
				if (typeof cell.getEmbeddedCells === "function") {
					embedded = cell.getEmbeddedCells() || [];
				} else {
					embedded = cell.get && cell.get("embeds") ? cell.get("embeds") : [];
				}

				// normalize various representations to array of id strings
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

		// find a parent container that contains all selected ids
		const parentContainer = allCells.find((cell) => {
			try {
				const embeddedIds = getEmbeddedIdsFromCell(cell);
				if (!embeddedIds || embeddedIds.length === 0) return false;
				// every selected id must be present among embeddedIds
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

		graph.on("add", (model) => {
			setIsDirty(true);
			if (model instanceof joint.dia.Link) return;
		});
	};

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

		let refModeActive = false;
		let selectedReferenceCollection = null;

		document.getElementById("refAttributeBtn").onclick = function () {
			refModeActive = true;
			selectedReferenceCollection = null;
			alert("Selecione a coleção a ser referenciada");
		};

		configs.paper.on("element:pointerup", function (cellView) {
			if (!refModeActive) return;

			const model = cellView.model;

			if (!selectedReferenceCollection) {
				selectedReferenceCollection = model;
				alert(
					"Agora selecione a coleção que vai receber o atributo de referência",
				);
				return;
			}

			const collectionDestino = model;

			const refAttribute = {
				name: "ref_" + selectedReferenceCollection.attr("headerText/text"),
				type: "reference",
				targetCollectionId: selectedReferenceCollection.id,
				targetCollectionName:
					selectedReferenceCollection.attr("headerText/text"),
			};

			let attributes = collectionDestino.get("customAttributes") || [];
			attributes.push(refAttribute);
			collectionDestino.set("customAttributes", attributes);

			if (typeof collectionDestino.updateTable === "function") {
				collectionDestino.updateTable(attributes);
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
					// normalize to actual cell objects
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
		enditorManager.loadElements([containerParent]);

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
