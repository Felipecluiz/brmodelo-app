var app = angular.module('myapp');

app.controller('optionsController', function($scope, $state, AuthService) {

	$scope.menuItens = [{
			text: "Preferências",
			action: function(){}
		}, {
			text: "Sair",
			action: function(){
				AuthService.logout();
				$state.go('login');
			}
	}];

	$scope.loading = false;

	$scope.showLoading = function(load) {
		$scope.loading = load;
	}

});
