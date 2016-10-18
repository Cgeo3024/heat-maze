var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');

app.set('port', (process.env.PORT || 5000));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
    res.sendFile(__dirname + 'index.html');
});

var timeLimitMins = 10;
var GroupRooms = [];
var barDelta = 5;
var timeGap = 5;
var voteGap = 3000; // time in between group room vote polls
var roomTemp = 15;
var userCount = 0;
var users = [];
var groupRoomNames = ["Easy", "Medium", "Hard"];
var soloRoomNames = ["A", "B", "C", "D"];

// == generates group rooms for use == //
function InitGroupRooms(){
    
    for( var i = 0; i < groupRoomNames.length; i++)
    {
        var newRoom = {};
        newRoom.name = groupRoomNames[i];
        newRoom.users = [];
        newRoom.room = initRoom("Group_" + groupRoomNames[i]);
        newRoom.timeLeft = 
        GroupRooms.push(newRoom);
    }
}


InitGroupRooms();

// Functions first set up when suer connects to the socket.io instance
io.on('connection', function(socket){
    
    console.log("new member joined!");
    
    users.push({id: socket.id, bars:null, handle: null});
    
    socket.on("Leave Room", function()
    {
        disconnect_socket_rooms(socket.id);
    });
    
    socket.on("Solo room", function(choice)
    {
        console.log("user " + socket.id +" switched to " + choice);
        
        var thisUser = getUser(socket.id);
        clearInterval(thisUser.handle);
        
        var newRoom = initRoom(choice);
        
        var initVals = summarize(newRoom);
        
        socket.emit("init", initVals);
        
        thisUser.room = newRoom;
        clearInterval(thisUser.handle);

        thisUser.solo = true;
        thisUser.handle = setInterval(function() {
           var alerts = iterateRoom(thisUser.room);
           var summary = summarize(thisUser.room);
           socket.emit("update bars", {bars: summary.bars, elapsedTime : timeGap});
           socket.emit("alerts", alerts);
           },
           timeGap);
           
    });
    
    socket.on("Group room", function(choice)
    {
        console.log(socket.id + " requests to join group room " + choice);
        
        if (groupRoomNames.indexOf(choice) == -1) {
            socket.emit("No Such Room");
            console.log("No such room found");
            return;
        }
        
        
        
        
        socket.join(choice);
        
        var thisUser = getUser(socket.id);
        
        thisUser.room = choice;
        thisUser.solo = false;
               
        var groupRoom = getGroupRoom(choice);
        
        for (user in groupRoom.users)
        {
            socket.emit("add user", groupRoom.users[user].name);
        }
        groupRoom.users.push(thisUser);
        
        var initVals = summarize(groupRoom.room);
        
        thisUser.name = ("guest" + groupRoom.users.length);
        
        socket.to(groupRoom.name).emit('chat message', {source:"system", type:"system", content: thisUser.name +" has joined the channel."});
        socket.to(groupRoom.name).emit("add user", thisUser.name);
        
        
        
        if (groupRoom.users.length <= 1)
        {   
            // sets the room end time for 10 minutes in the future
            groupRoom.endTime = Date.now() + (timeLimitMins * 60 * 1000);
            
            groupRoom.voteTime = Date.now() + voteGap;
            
            console.log("Setting Handle");
            groupRoom.tickHandle = setInterval(function() {
                var alerts = iterateRoom(groupRoom.room);
                var summary = summarize(groupRoom.room);
                io.to(groupRoom.name).emit("update room", {details: summary, elapsedTime : timeGap, timeLeft : groupRoom.endTime - Date.now(), voteTime: (groupRoom.voteTime - Date.now())});
                
                io.to(groupRoom.name).emit("alerts", alerts);
                
                if (Date.now() >= groupRoom.endTime)
                {
                    clearInterval(groupRoom.tickHandle);
                    clearInterval(groupRoom.voteHandle);
                    io.to(groupRoom.name).emit("Time Finished", {time_exceeded: groupRoom.timeExceeded, time_at_goal: groupRoom.timeAtGoal});
                }
            },
            timeGap);
            
            groupRoom.voteHandle = setInterval(function() {
                resolveVotes(groupRoom);
                io.to(groupRoom.name).emit("vote done");
                groupRoom.voteTime = Date.now() + voteGap;
            },
            voteGap);
        }
        
        socket.emit("init", initVals);     

        
    });
    
    socket.on("Start Rooms", function(choice)
    {
        if (choice == "Solo")
        {
            socket.emit("updateNav", soloRoomNames);
        }
        if (choice == "Group")
        {
            socket.emit("updateNav", groupRoomNames);
        }
    });

    
    
    // user requests change to variable heat sources
    socket.on("update sources", function(data){
        
        var thisUser = getUser(socket.id)
        
        if (thisUser.solo == false)
        {
            vote(thisUser, data);
            return;
        }        
        for (var i = 0; i < data.temps.length; i++){
            
            thisUser.room.bars[data.bar].temps[data.temps[i].pos] = data.temps[i].temp;

        }
    });
    
    socket.on('disconnect', function(){
        console.log(socket.id + " has left");
        
        // if the user was in a group room, tell their room they left
        var groupRoomName = getUser(socket.id).room;
        io.to(groupRoomName).emit('system message', socket.id + ' has disconnected');
        io.to(groupRoomName).emit('remove user', socket.id);
        
        disconnect_socket_rooms(socket.id);
        var thisUser = null;
        var index = -1;
        for (user in users){
            if (users[user].id == socket.id){
                thisUser = users[user];
                clearInterval(user.handle);
                index = user;
            }
        }
        if (index > -1)
        {
            users.splice(index, 1);
        }
        
        
    });
    
    socket.on("vote", function(votes){
        
        var thisUser = getUser(socket.id);
        thisUser.vote = votes;
        
        var groupRoomName = getUser(socket.id).room;
        io.to(groupRoomName).emit('user voted', thisUser.name);
        
        console.log("User vote recieved " + thisUser.name);
        console.log(thisUser.vote);
    });
    
    // ------------------------------ used for group chat connections -----------------//
    
    socket.on('chat message', function( msg){
        var roomName = getUser(socket.id).room;
        console.log(msg);
        console.log
        socket.broadcast.to(roomName).emit('chat message', {source:getUser(socket.id).name, type:"plain", content: msg});
    });
    // --- end of group chat settings ------------//
});

function disconnect_socket_rooms(socketID)
{
    var thisUser = getUser(socketID);
    var usersRoom = getGroupRoom(thisUser.room);
    
    // skip these steps if it is a group room
    if(groupRoomNames.indexOf(thisUser.room) == -1)
    {
        clearInterval(thisUser.handle);
        thisUser.room = null;
    }
    else
    {

        var index = -1;
        
        for (user in usersRoom.users)
        {
            if(usersRoom.users[user].id == socketID)
            {
                index = user;
            }
        }
        
        if(index > -1)
        {
            usersRoom.users.splice(index, 1);
            
        }
        
        if (usersRoom.users.length < 1)
        {
            clearInterval(usersRoom.tickHandle);
            clearInterval(usersRoom.voteHandle);
        }
        thisUser.room = null;

    }
        
}
function getMedian(data) {
    
    var midpoint = Math.floor((data.length - 1) / 2);
    if (data.length % 2 != 0) {
        return data[midpoint];
    } else {
        return (data[midpoint] + data[midpoint + 1]) / 2.0;
    }
}

function resolveVotes(room){
   
   
    var talley = [];
    for ( bar  in room.room.bars)
    {   
        talley.push([]);
        for(v in room.room.bars[bar].variable)
        {
            
            talley[bar].push({pos:room.room.bars[bar].variable[v].pos, values:[]});
        }
    }
    
    var voteCount = 0;
    for (i in room.users)
    {   

        var thisVote = room.users[i].vote;
        console.log("We have a vote:");
        console.log(thisVote);
        if(room.users[i].vote != null)
        {
            voteCount += 1;
        }
        
        for (bar in thisVote)
        {
            for (point in thisVote[bar].values)
            {
                console.log(thisVote[bar].values[point]);
                console.log(talley[thisVote[bar].bar][point]);
                if (thisVote[bar].values[point].pos == talley[thisVote[bar].bar][point].pos)
                {
                    talley[thisVote[bar].bar][point].values.push(thisVote[bar].values[point].temp);
                }
            }
        }
    }  
    console.log(talley);
    
    if (voteCount < 1)
    {
        return;        
    }
    
    for (bar in talley)
    {
        for (point in talley[bar])
        {
            var talleyVal = talley[bar][point];
            room.room.bars[bar].temps[talleyVal.pos] = getMedian(talleyVal.values);
        }
    }
    
    for (user in room.users)
    {
        room.users[user].vote = null;
    }
}

function getUser(socketID)
{
    for (i in users){
        if (users[i].id == socketID){
            return users[i];
        }
    }
}

function getGroupRoom(roomName)
{
    for (i in GroupRooms){
        if (GroupRooms[i].name == roomName){
            return GroupRooms[i];
        }
    }
}

// creates a condensed sumamry of the user room for transmission
function summarize(room)
{
    
    // temporarily stores the full list of summary bars
    var bars = [];

    for (var i = 0; i < room.bars.length; i++)
    {   
        var summBar = {};
        
        summBar.points = [];
        var bar = room.bars[i];
        
        for (var j = 0; j < bar.watchPoints.length; j++)
        {
            var pos = bar.watchPoints[j];
            summBar.points.push({pos: pos, temp: bar.temps[pos]});
        }
        
        if (bar.variable != null) {
            summBar.variable = [];
            for (var j = 0; j < bar.variable.length; j++)
            {
                var pos = bar.variable[j].pos;
                summBar.variable.push({pos: pos, temp: bar.temps[pos], options: bar.variable[j].options});
            }
        }
        
        if (bar.joins != null){
            summBar.joins = bar.joins;
        }
        
        summBar.id = bar.id;
        summBar.material = bar.material;
        
        if (bar.goals != null)
        {
            summBar.goals = [];
            for (goal in bar.goals)
            {
                var newGoal = bar.goals[goal];
                newGoal.actual = bar.temps[newGoal.pos];
                summBar.goals.push(newGoal);

            }            
        }
        
        
        bars.push(summBar);
        
    }
    
    
    
    return {room: "~", bars:bars, score:room.score, joins:room.joins};
}


function iterateRoom(room){
    var alerts = iterateBars(room.bars, room.roomTemp);
    
    var scoreMult = 1;
    if(alerts.goal_reached)
    {
        room.goalReached += timeGap;
        //scoreMult = 2;
    }
    
    // users do not gain points when limits have been exceeded
    if (alerts.limit_exceeded)
    {
        
        room.timeExceeded += timeGap;
        scoreMult = 0;
    }
    
    room.score += (scoreMult * alerts.score);
    
    return alerts;
}

function initRoom(roomType)
{
    // Room: {Users: [], name: string, bars: [], roomTemp: int, score: int}
    var newRoom = {score:0, roomTemp:20};
    newRoom.goalReached = false;
    newRoom.limitExceeded = false;
    newRoom.timeAtGoal = 0;
    newRoom.timeExceeded = 0;
    
    if (roomType == "A")
    {
        newRoom.bars=initBars("A");
    }
    if (roomType == "B")
    {
        newRoom.bars=initBars("B");
        newRoom.roomTemp = 20;
    }
    if (roomType == "C")
    {
        newRoom.bars=initBars("C");
        newRoom.roomTemp = 25;
        
        addJoin(newRoom, {bar: 0, pos: 9}, {bar: 1, pos: 2});
    }
    if (roomType == "D")
    {
        newRoom.bars=initBars("D");
        newRoom.roomTemp = 25;

        addJoin(newRoom, {bar: 0, pos: 4}, {bar: 2, pos: 0})
        addJoin(newRoom, {bar: 2, pos: 2}, {bar: 1, pos: 1})
        
    }
    if (roomType == "Group_Easy")
    {
        newRoom.bars=initBars("G_Easy");
        newRoom.roomTemp = 25;
        addJoin(newRoom, {bar:0, pos:19}, {bar:1, pos:0})
    }
    if (roomType == "Group_Medium")
    {
        newRoom.bars=initBars("G_Medium");
        newRoom.roomTemp = 25;
        addJoin(newRoom, {bar:0, pos:20}, {bar:2, pos:0});
        addJoin(newRoom, {bar:2, pos:10}, {bar:1, pos:18})
    }
    if (roomType == "Group_Hard")
    {
        newRoom.bars=initBars("G_Hard");
        newRoom.roomTemp = 25;
        addJoin(newRoom, {bar:0, pos:20}, {bar:2, pos:0});
        addJoin(newRoom, {bar:2, pos:10}, {bar:1, pos:18})
    }
    return newRoom;
}

function addJoin(room, sideA, sideB)
{
    var sides = [sideA, sideB];
    for (side in sides)
    {   
        var thisSide = sides[side];
        var thatSide = sides[sides.length - side - 1];
        if (room.bars[thisSide.bar].joins == null)
        {
            room.bars[thisSide.bar].joins = [];
        }
        
        room.bars[thisSide.bar].joins.push({pos: thisSide.pos, next: thatSide});
    }
}
function initBars(roomType){
    var bars = [];
    if (roomType == "A")
    {
        
        var newBar = initBar("A", 15, "Cu", 20, 5);
        
        newBar.fixed    = [0];
        newBar.variable = [{pos: 0, options: {floor: 20, ceil:120}}];
        newBar.goals=[{pos:14, temp:30}];        
        bars.push(newBar);
        
    }
    if (roomType == "B")
    {
        var newBar = initBar("A", 10, "Cu", 25, 5);
        
        newBar.fixed    = [0];
        newBar.variable = [{pos: 0, options: {floor: 20, ceil:120}}];
        newBar.goals=[{pos:9, temp:25}]; 
        newBar.globalLimit = 60;
        bars.push(newBar);
    }
    if (roomType == "C")
    {
        var newBar = initBar("A", 10, "Fe", 15, 5);
        
        newBar.fixed    = [0];
        newBar.variable = [{pos: 0, options: {floor: 20, ceil:120}}];
        bars.push(newBar);
        
        var newBar = initBar("B", 5, "Sn", 15, 5);
        newBar.goals=[{pos:0, temp:30},{pos:4, temp:30}]
        bars.push(newBar);
        
    }
    
    if (roomType == "D")
    {
        var newBar = initBar("A", 10, "Cu", 15, 5);
        newBar.goals = [{pos:9, temp:22}];
        newBar.fixed    = [0];
        newBar.variable = [{pos: 0, options: {floor: 20, ceil:120}}];
        bars.push(newBar);
        
        var newBar = initBar("B", 6, "Fe", 15, 5);
        newBar.fixed    = [5];
        newBar.variable = [{pos: 5, options: {floor: 20, ceil:120}}];
        bars.push(newBar);
        
        var newBar = initBar("C", 3, "Cu", 15, 5);
        bars.push(newBar);

    }
    
    if (roomType == "G_Easy")
    {
        var newBar = initBar("A", 30, "Cu", 20, 5);
        newBar.goals = [{pos:29, temp:33}];
        newBar.fixed    = [0];
        newBar.variable = [{pos: 0, options: {floor: 20, ceil:200}}];
        bars.push(newBar);
              
        var newBar = initBar("B", 12, "Cu", 20, 5);
        newBar.fixed  = [11];
        newBar.variable = [{pos: 11, options: {floor: 50, ceil:250}}];
        bars.push(newBar);

    }
    if (roomType == "G_Medium")
    {
        var newBar = initBar("A", 50, "Cu", 20, 6);
        newBar.fixed = [0];
        newBar.variable = [{pos: 0, options: {floor: 20, ceil:200}}];
        bars.push(newBar);
        
        var newBar = initBar("B", 30, "Cu", 20, 6);
        newBar.fixed = [29];
        newBar.variable = [{pos: 29, options: {floor: 20, ceil:200}}];
        bars.push(newBar);
        
        var newBar = initBar("C", 11, "Cu", 20, 6);
        newBar.goals = [{pos:5, temp: 50}]
        bars.push(newBar);

    }
    if (roomType == "G_Hard")
    {
        var newBar = initBar("A", 50, "Fe", 20, 6);
        newBar.fixed = [0];
        newBar.variable = [{pos: 0, options: {floor: 20, ceil:200}}];
        bars.push(newBar);
        
        var newBar = initBar("B", 30, "Cu", 20, 6);
        newBar.fixed = [29];
        newBar.variable = [{pos: 29, options: {floor: 20, ceil:200}}];
        bars.push(newBar);
        
        var newBar = initBar("C", 11, "Fe", 20, 6);
        newBar.goals = [{pos:5, temp: 50}]
        bars.push(newBar);
    }
    return bars;
}

// creates a standard bar with given length and standard temperature
function initBar(id, length, material, roomTemp, divisions){
    // bar: {temps:[], fixed:[{pos: int, temp:int}], watchPoints:[pos]}
    var newBar = {};
    newBar.id = id;
    newBar.material = material;
    newBar.temps = [];
    
    for (i = 0; i < length; i++){
        newBar.temps.push(roomTemp);
    }
    
    newBar.watchPoints = divideBar(length, divisions);
    
    return newBar;
    //newBar.Area = CXArea;
}
// provides an array of important watchpoints
function divideBar(length, divisions)
{
    points = [];
    
    if (divisions > 0){
        var increment = (length -1)/(divisions -1);
        
        var i = 0;
        var pos = 0;
        

        // dividing the bar stops if we run out of bar or divisions
        while ( i <= divisions && pos < length)
        {
            points.push(Math.floor(pos));
            
            pos += increment;
            i += 1;
        }  
    }
    
    return points;
}
// iterates temperature changes along a bar.
// CURENTLY NOT COMPLETE FOR THE EXTREME ENDS OF BARS
function iterateBars(bars, roomTemp){
    
    var goal_reached = true;
    var limit_exceeded = false;
    var goalScore = 0;
    
    for (bar in bars){
        var nextTemps = [];
        var thisBar = bars[bar];
        for (var i = 0; i < thisBar.temps.length; i++){
            nextTemps.push(thisBar.temps[i]);
            
            var secondDerivTX = 0;
            
            if (i == 0){
                secondDerivTX = 
                (- 2*thisBar.temps[i] + thisBar.temps[i + 1] +roomTemp)/(barDelta*barDelta/1000000);
            } 
            else if (i == thisBar.temps.length -1)
            {
                secondDerivTX = 
                (thisBar.temps[i -1] - 2*thisBar.temps[i] +roomTemp)/(barDelta*barDelta/1000000);
            }
            else 
            {
                secondDerivTX = 
                (thisBar.temps[i -1] - 2* thisBar.temps[i] + thisBar.temps[i + 1])/(barDelta*barDelta/1000000);
            }
            
            var diffusivity =  0.000023;
            
            if (thisBar.material == "Cu"){
            diffusivity = 0.000111;
            }
            if (thisBar.material == "Fe"){
                diffusivity = 0.000023;
            }
            if (thisBar.material == "Qu"){
                diffusivity = 0.0000014;
            }
            if (thisBar.material == "Sn"){
                diffusivity = 0.00004;
            }
        
            var deltaT = secondDerivTX * diffusivity *timeGap/1000;
            nextTemps[i] = thisBar.temps[i] + deltaT;
        }
        

        // iterates over this bar's joins
        for (join in thisBar.joins )
        {   


            var thisJoin =  thisBar.joins[join];

            var secondDerivTX = 
                ( -thisBar.temps[thisJoin.pos]
                  + bars[thisJoin.next.bar].temps[thisJoin.next.pos])
                    /(barDelta*barDelta/1000000);
            var diffusivity = 0.000111;
            
            var deltaT = secondDerivTX * diffusivity *timeGap/1000;

            nextTemps[thisJoin.pos] = nextTemps[thisJoin.pos] + deltaT;
        }
        
        if (bars[bar].fixed != null)
        {
            for (var i = 0; i <bars[bar].temps.length; i++){
                if (bars[bar].fixed.indexOf(i) == -1) {
                    bars[bar].temps[i] = nextTemps[i];
                } else {
                    bars[bar].temps[i] = bars[bar].temps[i];
                }
            }
        }
        else
        {
            for (pos in thisBar.temps)
            {
                thisBar.temps[pos] =  nextTemps[pos];
            }
        }
      
        if (bars[bar].globalLimit!= null)
        {
            for (temp in nextTemps)
            {
                if (nextTemps[temp] > bars[bar].globalLimit)
                {
                    limit_exceeded = true;
                }
            }
        }
        
        for (goal in bars[bar].goals)
        {
            var diff = Math.abs(bars[bar].temps[bars[bar].goals[goal].pos] - bars[bar].goals[goal].temp);
            
            if ( diff > 1)
            {
                goal_reached = false;
            }
            
            goalScore += Math.max(50 - (0.5 * diff * diff), 0);
        }
        nextTemps = [];
    } 
    
    goalScore = goalScore / 1000
    return ({score: goalScore, limit_exceeded:limit_exceeded, goal_reached:goal_reached});
}


http.listen((process.env.PORT || 3000), function(){
  console.log('listening on *:3000');
});


