var app = angular.module('HeatMazeApp',[]);

app.controller('mainController', function($scope, socket) {
    
    // ---- Solo User Room Constants --- //
    $scope.navChoices = ["Group", "Solo"];
    $scope.users = [];
    $scope.bars = [];
    $scope.room = null;     
    $scope.time = 0;
    $scope.variableVals = [];
    $scope.template = "./partials/main.html";
    $scope.style = null;
    $scope.descrURL = "./partials/descriptions/main.html";
    $scope.description = true;
    $scope.navDepth = 0;
    $scope.score = 0;
    $scope.goal_reached = false;
    $scope.limit_exceeded = false;
    var canvas = null;
    var context;
    
    // --- requests room change from the server ----//
    $scope.changeRoom = function(room){
        console.log("ChangeRoom Request::" +  room);
        $scope.room = null;
        socket.emit("switch room", ("Solo_"+room));
    }
    
    function initializeCanvas(){
        canvas = document.getElementById('barView');
        context = canvas.getContext('2d');
        draw();
    }
    
    function draw() {
        if (canvas.getContext) {
            var ctx = canvas.getContext("2d");
            var thickness = 10;
            console.log($scope.bars);
            for (bar in $scope.bars)
            {
                ctx.fillStyle = "rgb(200,0,0)";
                ctx.fillRect(thickness * (bar + 1), 10, 
                        $scope.bars[bar].points[$scope.bars[bar].points.length -1].pos
                        * thickness, thickness);
            }
            
            /*ctx.fillRect (10, 10, 50, 50);

            ctx.fillStyle = "rgba(0, 0, 200, 0.5)";
            ctx.fillRect (30, 30, 50, 50); */
        }
    }

    $scope.back = function(){
        
        console.log("NavDepth " + $scope.navDepth);
        if ($scope.navDepth == 1)
        {
            socket.emit("Leave Rooms");
            $scope.style = null;
            $scope.template = "./partials/main.html";
            $scope.descrURL = "./partials/descriptions/main.html";
            $scope.description = true;
            $scope.navChoices = ["Group", "Solo"];
        }
        if ($scope.navDepth > 1)
        {
            socket.emit("Leave Room");
            socket.emit("Start Rooms", $scope.stlye);
            $scope.template = "./partials/" + $scope.style + ".html";
            $scope.descrURL = "./partials/descriptions/"+ $scope.style + ".html";
            $scope.room = null;
            canvas = null;
            $scope.description = true;
        }
        
        $scope.navDepth -=1;
         
    }
    
    $scope.navigateTo = function(choice){
        $scope.navDepth += 1;
        if ($scope.style == null )
        {
            socket.emit("Start Rooms", choice);
            $scope.style = choice;
            $scope.template = "./partials/" + choice + ".html";
            $scope.descrURL = "./partials/descriptions/"+ choice + ".html";
        }
        else
        {
            $scope.description = false;
            socket.emit($scope.style + " room", choice);
            console.log($scope.style + " room");
        }
        
        console.log("scope.style: " + $scope.style);
        console.log($scope.template);
        console.log($scope.descrURL);
    }
    
    $scope.vote = function(){
        
        var votes = [];
        for (vv in $scope.variableVals)
        {
            if ($scope.variableVals[vv].variables.length > 0)
            {
                votes.push($scope.variableVals[vv]);
            }
        }
        socket.emit("vote", votes);
    }
    
    // -- Requests change of variable heat source values --- ///
    $scope.updateSource = function(index){
        var num = index;
        
        socket.emit("update sources", 
        {temps:$scope.variableVals[index].variables, bar:index});
    }
    
    socket.on("alerts", function(data){
        console.log("Alerts");
        console.log(data);
        $scope.limit_exceeded = data.limit_exceeded;
        $scope.goal_reached = data.goal_reached;
    });
    
    // ----- sets up a new room --- //
    socket.on('init', function (data) {

        $scope.users = {name: "Me", score: 0};
        $scope.bars = data.bars;
        $scope.room = data.room;
        $scope.time = 0;
        $scope.variableVals = [];
        
        // ---- Constructs a list of variable heat sources, to allow user updates. --- //
        console.log(data);
        for (var j = 0; j < data.bars.length; j++){
            
            var newArray = [];
            console.log(data.bars[j]);
            if (!(data.bars[j].variable == null)) {
                console.log("Doing variable Vals");
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
       $scope.score = data.score;
       $scope.time += data.elapsedTime;
       
       if (canvas == null)
       {
           initializeCanvas();
       }
    });
    
    // this is a more comprehensive method including victory condition handling //
    socket.on('update room', function(data){
       var bars = data.details.bars;
       for (i = 0; i < bars.length; i++){
           
           for (j = 0; j < bars[i].points.length; j++){
               
               $scope.bars[i].points[j] = bars[i].points[j];
           }
       }
       $scope.score = data.details.score;
       $scope.time += data.elapsedTime;
    });
    
    //------------used for group rooms ------//
    socket.on('new user', function (data){
        $socket.users.append(data);
    });
    
    socket.on('update users', function (data){
        
    });
    
    socket.on('updateNav', function(navVals){
        $scope.navChoices = navVals;
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