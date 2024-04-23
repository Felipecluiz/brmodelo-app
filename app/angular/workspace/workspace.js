import angular from "angular";
import authService from "../service/authService";
import modelAPI from "../service/modelAPI";
import template from "./workspace.html";
import modelCreateComponent from "../components/createModelModal";
import modelDuplicatorComponent from "../components/duplicateModelModal";
import modelDeleterComponent from "../components/deleteModelModal";
import modelRenameComponent from "../components/renameModelModal";
import bugReportButton from "../components/bugReportButton";
import githubSponsorBanner from "../components/githubSponsorBanner";
import shareModelModal from "../components/shareModelModal";
import iconConceptual from  "../components/icons/conceptual";
import iconLogic from  "../components/icons/logic";


const ListController = function (
	$state,
	$rootScope,
	$uibModal,
	AuthService,
	ModelAPI,
	$filter,
	$timeout
) {
	const ctrl = this;
	ctrl.loading = false;
	ctrl.models = [];
	ctrl.dropdownOptions = [
		{ name: $filter('translate')("Preferences"), type: 'preferences' },
		{ name: $filter('translate')("Logout"), type: 'logout' }
	];

	ctrl.feedback = {
		message: "",
		showing: false,
		type: "success"
	}

	ctrl.showFeedback = (newMessage, show, type) => {
		$timeout(() => {
			ctrl.feedback.message = $filter('translate')(newMessage);
			ctrl.feedback.showing = show;
			ctrl.feedback.type = type;
		})
	}

	const showLoading = (loading) => {
		ctrl.loading = loading;
	};

	const mapListData = (models) => {
		return models.map((model) => {
			if (model.type == "conceptual") {
				model.typeName = $filter('translate')("Conceptual");
			} else {
				model.typeName = $filter('translate')("Logical");
			}
			model.authorName = AuthService.loggeduserName;
			return model;
		});
	};

	const doDelete = (model) => {
		showLoading(true);
		ModelAPI.deleteModel(model._id).then((resp) => {
			if (resp.status === 200) {
				ctrl.models.splice(ctrl.models.indexOf(model), 1);
			}
			showLoading(false);
			ctrl.showFeedback($filter('translate')("Successfully deleted!"), true, 'success');
		});
	};

	ctrl.$onInit = () => {
		showLoading(true);
		ModelAPI.getAllModels($rootScope.loggeduser).then((models) => {
			ctrl.models = [...mapListData(models.data)];
			showLoading(false);
		});
	};

	ctrl.openModel = (model) => {
		if (model.type === "logic") {
			return $state.go("logic", {
				references: { modelid: model._id, conversionId: "" },
			});
		}
		$state.go(model.type, {
			modelid: model._id,
		});
	};

	ctrl.newModel = () => {
		const modalInstance = $uibModal.open({
			animation: true,
			template: '<create-model-modal close="$close(result)" dismiss="$dismiss()"></create-model-modal>',
		});
		modalInstance.result.then((model) => {
			showLoading(true);
			ModelAPI.saveModel(model).then((newModel) => {
				ctrl.openModel(newModel);
				showLoading(false);
			});
		});
	};

	ctrl.renameModel = (model) => {
		const modalInstance = $uibModal.open({
			animation: true,
			backdrop: 'static',
			keyboard: false,
			template: '<rename-model-modal close="$close(result)" dismiss="$dismiss(newName)"></rename-model-modal>',
		});
		modalInstance.result.then((newName) => {
			showLoading(true);
			ModelAPI.renameModel(model._id, newName).then((resp) => {
				if (resp.status === 200) {
					model.name = newName;
				}
				showLoading(false);
				ctrl.showFeedback($filter('translate')("Successfully renamed!"), true, 'success');
			});
		});
	};

	ctrl.deleteModel = (model) => {
		const modalInstance = $uibModal.open({
			animation: true,
			template: '<delete-model-modal close="$close(result)" dismiss="$dismiss(reason)"></delete-model-modal>',
		});
		modalInstance.result.then(() => {
			doDelete(model);
		});
	};

	ctrl.menuOptionSelected = (option) => {
		switch(option.type) {
			case "logout":  ctrl.doLogout()
				break;
			case "preferences":  $state.go("preferences");
				break;
		}
	}

	ctrl.doLogout = () => {
		AuthService.logout();
		$state.go("login");
	}

	ctrl.duplicateModel = (model) => {
		const modalInstance = $uibModal.open({
			animation: true,
			template: '<duplicate-model-modal suggested-name="$ctrl.suggestedName" close="$close(result)" dismiss="$dismiss(reason)"></duplicate-model-modal>',
			controller: function() {
				const $ctrl = this;
				$ctrl.suggestedName = $filter('translate')("MODEL_NAME (copy)", { name: model.name });
			},
			controllerAs: '$ctrl',
		});
		modalInstance.result.then((newName) => {
			showLoading(true);
			const duplicatedModel = {
				id: "",
				name: newName,
				type: model.type,
				model: model.model,
				user: model.who,
			};
			ModelAPI.saveModel(duplicatedModel).then((newModel) => {
				newModel.authorName = model.authorName;
				newModel.typeName = model.typeName;
				ctrl.models.push(newModel);
				showLoading(false);
			});
		});
	};

	ctrl.shareModel = (model) => {
		const modalInstance = $uibModal.open({
			animation: true,
			backdrop: 'static',
			keyboard: false,
			template: '<share-model-modal close="$close(result)" dismiss="$dismiss()" model-id="$ctrl.modelId"></share-model-modal>',
			controller: function() {
				const $ctrl = this;
				$ctrl.modelId = model._id;
			},
			controllerAs: '$ctrl',
		}).result;
		modalInstance.then(() => {
			console.log("Successfully share config saved!");
			ctrl.showFeedback($filter('translate')("Sharing configuration has been updated successfully!"), true, 'success');
		}).catch((reason) => {
			console.log("Modal dismissed with reason", reason);
		});
	};

};

export default angular
	.module("app.workspace", [
		'ui.bootstrap',
		authService,
		modelAPI,
		modelCreateComponent,
		modelDuplicatorComponent,
		modelDeleterComponent,
		modelRenameComponent,
		bugReportButton,
		githubSponsorBanner,
		shareModelModal,
		iconConceptual,
		iconLogic
	])
	.component("workspace", {
		template,
		controller: ListController,
	}).name;
