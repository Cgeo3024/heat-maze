var app = angular.module('HeatMazeApp',[]);

app.controller('mainController', function($scope, socket) {
    
    
    // ---- Solo User Room Constants --- //
    $scope.roomList=["A", "B", "C", "D"];
    $scope.users = [];
    $scope.bars = [];
    $scope.room = null;     
    $scope.time = 0;
    $scope.variableVals = [];
    $scope.template = "./partials/main.html";
    
    // --- requests room change from the server ----//
    $scope.changeRoom = function(room){
        console.log("ChangeRoom Request::" +  room);
        $scope.room = null;
        socket.emit("switch room", ("Solo_"+room));
    }
    
    // -- Requests change of variable heat source values --- ///
    $scope.updateSource = function(index){
        var num = index;
        socket.emit("update sources", 
        {temps:$scope.variableVals[index].variables, bar:index});
    }
    
    // ----- sets up a new room --- //
    socket.on('init', function (data) {

        $scope.users = {name: "Me", score: 0};
        $scope.bars = data.bars;
        $scope.room = data.room;
        $scope.time = 0;
        $scope.variableVals = [];
        
        // ---- Constructs a list of variable heat sources, to allow user updates. --- //
        for (var j = 0; j < data.bars.length; j++){
            
            var newArray = [];
            
            if (!(data.bars[j].variable == null)) {
                for (var i = 0; i < data.bars[j].variable.length; i++){  
                    var variable = data.bars[j].variable[i];
                    newArray.push({pos: variable.pos, temp: variable.temp   })
                }
            }
            $scope.variableVals.push({bar: j, variables:newArray});
        }
        
    });
    
    // updates the temperature values
    socket.on('update bars', function (data){
       for (i = 0; i < data.bars.length; i++){
           
           for (j = 0; j < data.bars[i].points.length; j++){
               
               $scope.bars[i].points[j] = data.bars[i].points[j];
           }
       }
       
       $scope.time += data.elapsedTime;
    });
    
    //------------used for group rooms ------//
    socket.on('new user', function (data){
        $socket.users.append(data);
    });
    
    socket.on('update users', function (data){
        
    });
});

// This factory wraps the socket.io functionality to 
// allow access to it within the angular controller
app.factory('socket', function ($rootScope) {
  var socket = io.connect();
  return {
    on: function (eventName, callback) {
      socket.on(eventName, function () {  
        var args = arguments;
        $rootScope.$apply(function () {
          callback.apply(socket, args);
        });
      });
    },
    emit: function (eventName, data, callback) {
      socket.emit(eventName, data, function () {
        var args = arguments;
        $rootScope.$apply(function () {
          if (callback) {
            callback.apply(socket, args);
          }
        });
      })
    }
  };
});