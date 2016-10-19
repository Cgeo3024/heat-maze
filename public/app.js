var app = angular.module('HeatMazeApp',['rzModule']);

app.controller('mainController', function($scope, $timeout, socket) {
    
    // ---- Solo User Room Constants --- //
    $scope.navChoices = ["Group", "Solo"];
    $scope.users = [];
    $scope.bars = [];
    $scope.room = null;     
    $scope.time = 0;
    $scope.variableVals = [];
    $scope.template = "./partials/descriptions/main.html";
    $scope.header = "./partials/header.html";
    $scope.style = null;
    $scope.descrURL = "./partials/descriptions/main.html";
    $scope.chatWindow = "./partials/chat.html";
    $scope.description = true;
    $scope.navDepth = 0;
    $scope.score = 0;
    $scope.goal_reached = false;
    $scope.limit_exceeded = false;
    $scope.vol = 90;
    $scope.mins = 10;
    $scope.seconds = 00;
    $scope.timeAtGoal = 0;
    $scope.timeExceeded = 0;
    $scope.chatCollapseIcon = ">>";
    
    // ---- group room variables --- //
    $scope.messages = [];
    $scope.chat = {myMessage: ""};
    $scope.showChat = false;
    
    $scope.voteTime = 0;
    
    $scope.yourName = "";
    $scope.haveVoted = false;
    
    var canvas = null;
    var context;
    var thickness =5;
    var drawn = [];
    var cCoefficient = 1;
    
    // --- requests room change from the server ----//
    $scope.changeRoom = function(room){
        console.log("ChangeRoom Request::" +  room);
        $scope.room = null;
        socket.emit("switch room", ("Solo_"+room));
    }
    
    $scope.toggleChat = function(){
        console.log("showChat is " + $scope.showChat);
        $scope.showChat = !$scope.showChat;
        if ($scope.chatCollapseIcon == "<<")
        {
           $scope.chatCollapseIcon = ">>"; 
        }
        else
        {
            $scope.chatCollapseIcon = "<<";
        }
    }
    
    // sets up the display siumulation for the bars
    function initializeCanvas(){
        canvas = document.getElementById('barView');
        context = canvas.getContext('2d');
        draw();
    }
    
    function draw() {
        console.log("BARS");
        if (canvas.getContext) {
            var ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            var thickness = 10;
            console.log($scope.bars);
            
            var maxSize = 0;
            for (bar in $scope.bars)
            {
                maxSize = Math.max(maxSize,$scope.bars[bar].points[$scope.bars[bar].points.length -1].pos );
            }
            
            cCoefficient = ((0.8 * canvas.height )/(thickness * maxSize));
            console.log("CCoefficient found of " + cCoefficient);
            for (bar in $scope.bars)
            {
                console.log(bar);
                drawBar(ctx, bar, false, 0.1* canvas.height, 0.1*canvas.height);
               
            }

        }
    }
    
    function drawBar(ctx, bar,horizontal=false, startX=0, startY=0)
    {
        console.log(bar);
        console.log($scope.bars);
        bar = parseInt(bar);
        ctx.font = "25px serif";
        // only draw bars not already drawn
        console.log("Drawn index " + drawn.indexOf(bar));
        if (drawn.indexOf(bar) < 0)
        {
            console.log("Drawing bar : " + bar + " At X: " + startX + " and Y: " + startY);
            console.log(drawn);
            console.log(bar);
            drawn.push(bar);
            ctx.fillStyle = "grey";
            console.log("Starting at : X, Y: " + startX + " " + startY);
            console.log("horizontal: " + horizontal);
            console.log($scope.bars);
            
            
            if (horizontal)
            {
                ctx.fillRect(startX, startY, $scope.bars[bar].points[$scope.bars[bar].points.length -1].pos
                * thickness * cCoefficient,
                thickness * cCoefficient);
                
            }
            else
            {
                ctx.fillRect(startX, startY, 
                cCoefficient * thickness,
                $scope.bars[bar].points[$scope.bars[bar].points.length -1].pos
                * thickness * cCoefficient);
            }
            ctx.fillStyle = "black";
            ctx.fillText($scope.bars[bar].id, startX + thickness, startY + thickness);

            var orientation = !horizontal;  
            console.log("orientation is : " + orientation + "When horizontal is " + horizontal);
            ctx.fillStyle="blue";
            ctx.fillStyle="red";
            console.log($scope.bars[bar].variable)
            
            // draws all heat sources on the current bar
            for (variable in $scope.bars[bar].variable)
            {
                var thisVar = $scope.bars[bar].variable[variable];
                console.log("Drawing variable position of " + bar);
                console.log("Horizontal is " + horizontal);
                if (horizontal)
                {
                    ctx.fillRect(startX + cCoefficient * thisVar.pos * thickness,
                        startY,
                    cCoefficient * thickness,
                    thickness);
                }
                else
                {
                    ctx.fillRect(startX, startY + (cCoefficient * thisVar.pos * thickness), 
                    cCoefficient * thickness,
                    thickness);
                }
            }
            ctx.fillStyle="green";
            
            
            for (join in $scope.bars[bar].joins)
            {
                console.log("Drawing Join");
                console.log($scope.bars[bar].joins[join])
                var newX;
                var newY;
                if (horizontal)
                {
                    newX = startX + (cCoefficient * $scope.bars[bar].joins[join].pos * thickness);
                    newY = startY - (cCoefficient * $scope.bars[bar].joins[join].next.pos);
                    
                }
                else
                {
                    newX = startX;
                    newY = startY + (cCoefficient * $scope.bars[bar].joins[join].pos * thickness);
                }
                console.log(newY);
                console.log(newX);
                drawBar(ctx, $scope.bars[bar].joins[join].next.bar, orientation, newX,
                newY);
                
            }
        }
    }
    $scope.back = function(){
        
        console.log("NavDepth " + $scope.navDepth);
        if ($scope.navDepth == 1)
        {
            socket.emit("Leave Rooms");
            $scope.style = null;
            $scope.template = "./partials/descriptions/main.html";
            $scope.descrURL = "./partials/descriptions/main.html";
            $scope.description = true;
            $scope.navChoices = ["Group", "Solo"];
        }
        if ($scope.navDepth > 1)
        {
            socket.emit("Leave Room");
            socket.emit("Start Rooms", $scope.stlye);
            $scope.template = "./partials/descriptions/"+ $scope.style + ".html";
            $scope.descrURL = "./partials/descriptions/"+ $scope.style + ".html";
            $scope.room = null;
            canvas = null;
            drawn = [];
            $scope.description = true;
            $scope.showChat = false;
        }
        
        $scope.navDepth -=1;
         
    }
    
    $scope.navigateTo = function(choice){
        $scope.navDepth += 1;
        if ($scope.style == null )
        {
            socket.emit("Start Rooms", choice);
            $scope.style = choice;
            $scope.template = "./partials/descriptions/"+ choice + ".html";
            $scope.descrURL = "./partials/descriptions/"+ choice + ".html";
        }
        else
        {   
            $scope.template = "./partials/"+$scope.style+".html";
            $scope.description = false;
            socket.emit($scope.style + " room", choice);
            console.log($scope.style + " room");
            
            if ($scope.style == "Group")
            {
                $scope.showChat = true;
            }
        }
        
        console.log("scope.style: " + $scope.style);
        console.log($scope.template);
        console.log($scope.descrURL);
    }
    
    $scope.vote = function(){
        
        console.log("voting");
        console.log($scope.variableVals);
        $scope.haveVoted = true;
        var votes = [];
        var points = [];
        for (bar in $scope.variableVals)
        {
            var thisBar = $scope.variableVals[bar];
            for (v in thisBar.variables)
            {
                points.push({pos: thisBar.variables[v].pos, temp: thisBar.variables[v].temp});
            }
            votes.push({ bar: bar, values: points});
            points = [];
        }
        console.log(votes);
        socket.emit("vote", votes);
    }
    
    // -- Requests change of variable heat source values --- ///
    $scope.updateSource = function(index){
        var num = index;
        
        socket.emit("update sources", 
        {temps:$scope.variableVals[index].variables, bar:index});
    }
    
    socket.on("alerts", function(data){

        $scope.limit_exceeded = data.limit_exceeded;
        $scope.goal_reached = data.goal_reached;
    });
    
    // ----- sets up a new room --- //
    socket.on('init', function (data) {

        //$scope.users.push({name: "Me", score: 0};
        $scope.bars = data.bars;
        $scope.room = data.room;
        $scope.time = 10* 60 * 1000;
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
                    newArray.push({pos: variable.pos, temp: variable.temp, options: variable.options})
                }
            }
            console.log(newArray);
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
       //$scope.time -= data.elapsedTime;
       $scope.timeLeft;
       
       if (canvas == null)
       {
           initializeCanvas();
       }
    });
    
    // registers that the group room's votes have been resolved
    socket.on("vote done", function()
    {
        console.log("vote finished");
        $scope.haveVoted = false;
        for (user in $scope.users)
        {
            $scope.users[user].voted = false;
        }
    });
    
    socket.on('user voted', function(name)
    {
        for (user in $scope.users)
        {
            if ($scope.users[user].name == name)
            {
                $scope.users[user].voted = true;
            }
        }           
    });

    
    socket.on("Time Finished", function(data){
        $scope.template = "./partials/scoreCard.html";
        
        
        console.log("end data found");
        console.log(data);
        $scope.timeAtGoal = data.time_at_goal;
        $scope.timeExceed = data.time_exceeded;
        
        $timeout(showGraph(data.score_profile), 5000);
        
    });
    
    // this is a more comprehensive method including victory condition handling //
    socket.on('update room', function(data){
        var bars = data.details.bars;
        for (i = 0; i < bars.length; i++){
           
            for (j = 0; j < bars[i].points.length; j++){

                $scope.bars[i].points[j] = bars[i].points[j];
            }

            for (goal in $scope.bars[i].goals)
            {
                var thisGoal = $scope.bars[i].goals[goal];

                thisGoal.actual = bars[i].goals[goal].actual;
                
                if (Math.floor(thisGoal.actual) == Math.floor(thisGoal.temp))
                {
                
                    thisGoal.completed = true;
                }
                else
                {
                    thisGoal.completed = false;
                }
            }
        }
        
        $scope.voteTime = data.voteTime;
        
        $scope.score = data.details.score;
        //$scope.time -= data.elapsedTime;

        $scope.time = data.timeLeft;

        $scope.mins = Math.floor($scope.time/(60 * 1000));
        $scope.seconds = $scope.time%(60 * 1000);

        if (canvas == null)
        {
           initializeCanvas();
        }
    });
    
    //------------used for group rooms ------//
    socket.on('new user', function (data){
        $scope.users.append(data);
    });
    
    socket.on('update users', function (data){
        
    });
    
    socket.on('updateNav', function(navVals){
        $scope.navChoices = navVals;
    });
    
    
    // ----------------------- Chat messaging section --------------------//
        socket.on('connect', function(){
            socket.emit('user count query');
        });
        
        socket.on('user count response', function(count){
            $("#userMult").text(count);
        });
        
        socket.on('accept name', function(name){
            console.log("My name " + name + " was accepted!");
            $("#loginStats").hide();
            $("#messageBlock").show();
            $("#m").focus();
            
            socket.emit("list users");
            $('#yourName').text(name);
        });
        
        socket.on('reject name', function(){
            console.log("My name request rejected :(");
            $("#warning").show();
        });

        socket.on('chat message', function(msg){
            console.log("recieved message" );
            console.log(msg);
            $scope.messages.push(msg);
        });
        
        socket.on('system message', function(msg){
            $scope.messages.push(msg);
        });
        
        socket.on('add user', function(name){
            $scope.users.push({name: name, hasVoted:false});
        });
        
        socket.on('remove user', function(name){
            for (user in $scope.users)
            {
                if ($scope.users[user].name == name)
                {
                    $scope.users.splice(user, 1);
                }
            }
        });

        
        $scope.sendMessage = function()
        {
            if ($scope.chat.myMessage == "")
            {
                return;
            }
            console.log("Sending chat message " + $scope.chat.myMessage);
            $scope.messages.push({source: "You", type: "plain", content: $scope.chat.myMessage});
            socket.emit("chat message", $scope.chat.myMessage);
            
            $scope.chat.myMessage = "";
        }
        // ---- end of group messaging section --- //
});

function showGraph(data){
    ctx = document.getElementById("myChart");
    //ctx = document.getElementById("barView");
    console.log(data);
    //data.times  
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels : data.times,
            datasets :[
            {
                label: "bar temperatures",
                fill: false,
                data:data.scoreIncreace,
            }
            ]
        }
    });
}

/*

 $('#nameSelection').submit(function(){
    console.log("submitting name w/ jquery");
    var name = $("#name").val();
    socket.emit("request name", name);
    return false;
});

$('#messageForm').submit(function(){
    var message = $('#m').val();
    socket.emit('chat message', name, message);
    var ownMessage = "You said: " + message;
    displayMessage(ownMessage);
    $('#m').val('');  
    return false;
});     

function displayMessage(msg, type){
    $('#messages').append($('<li class="'+type+'">').text(msg));
    $('#messages').animate({scrollTop: $('#messages').prop("scrollHeight")}, 300);
}; */
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