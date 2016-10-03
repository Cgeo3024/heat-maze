var app = angular.module('HeatMazeApp',[]);

app.controller('mainController', function($scope, socket) {
    
    $scope.roomList=["A", "B", "C"];
    $scope.users = [];
    $scope.bars = [];
    $scope.room = null;     
    $scope.time = 0;
    $scope.variableVals = [];
    
    $scope.changeRoom = function(room){
        console.log("ChangeRoom Request::" + room);
        $scope.room = null;
        socket.emit("switch room", room);
    }
    
    $scope.updateSource = function(index){
        var num = index;
        socket.emit("update sources", 
        {temps:$scope.variableVals[index].variables, bar:index});
        console.log("index : " + num);
    }
    
    socket.on('init', function (data) {
        console.log(data);
        $scope.users = {name: "Me", score: 0};
        //$scope.users.push(data.users);
        $scope.bars = data.bars;
        $scope.room = data.room;
        $scope.time = 0;
        $scope.variableVals = [];
        
        for (var j = 0; j < data.bars.length; j++){
            
            var newArray = [];
            
            if (!(data.bars[j].variable == null)) {
                for (var i = 0; i < data.bars[j].variable.length; i++){
                    var pos = data.bars[j].variable[i]
                    console.log(pos);
                    
                    newArray.push({pos: pos, temp: data.bars[j].temps[pos]})
                }
            }
            $scope.variableVals.push({bar: j, variables:newArray});
        }
    });
    
    socket.on('update bars', function (data){
       for (i = 0; i < data.bars.length; i++){
           
           for (j = 0; j < data.bars[i].temps.length; j++){
               
               $scope.bars[i].temps[j] = data.bars[i].temps[j];
           }
       }
       
       //$scope.time += data.elapsedTime ;
       //$scope.bars = data.bars;
       //console.log(data);
       //console.log($scope.bars);
    });
    
    socket.on('new user', function (data){
        $socket.users.append(data);
    });
    
    socket.on('update users', function (data){
        
    });
});


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