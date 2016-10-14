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
        groupRoom.users.push(thisUser);
        var initVals = summarize(groupRoom.room);
        
        if (groupRoom.users.length <= 1)
        {
            console.log("Setting Handle");
            groupRoom.tickHandle = setInterval(function() {
                var alerts = iterateRoom(groupRoom.room);
                groupRoom.room.score += 1;
                var summary = summarize(groupRoom.room);
                io.to(groupRoom.name).emit("update room", {details: summary, elapsedTime : timeGap});
                io.to(groupRoom.name).emit("alerts", alerts);
            },
            timeGap);
            
            groupRoom.voteHandle = setInterval(function() {
                resolveVotes(groupRoom);
                io.to(groupRoom.name).emit("vote done");
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
    });
});

function disconnect_socket_rooms(socketID)
{
    var thisUser = getUser(socketID);
    var usersRoom = getGroupRoom(thisUser.room);
    
    // skip these steps if it is a group room
    if(groupRoomNames.indexOf(thisUser.room) == -1)
    {
        console.log(thisUser);
        clearInterval(thisUser.handle);
        thisUser.room = null;
        
        console.log(thisUser);
    }
    else
    {
        console.log(usersRoom);
        console.log(thisUser);
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
        console.log(usersRoom);
        console.log(thisUser);
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
            
            talley[bar].push({pos:room.room.bars[bar].variable[v], values:[]});
        }
    }
    
    var voteCount = 0;
    for (i in room.users)
    {   

        var thisVote = room.users[i].vote;
        
        if(room.users[i].vote != null)
        {
            voteCount += 1;
        }
        
        for (bar in thisVote)
        {
            for (point in thisVote[bar].variables)
            {
                console.log(thisVote[bar].variables[point]);
                console.log(talley[thisVote[bar].bar][point]);
                if (thisVote[bar].variables[point].pos == talley[thisVote[bar].bar][point].pos)
                {
                    talley[thisVote[bar].bar][point].values.push(thisVote[bar].variables[point].temp);
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
        var bar = room.bars[i]
        
        for (var j = 0; j < bar.watchPoints.length; j++)
        {
            var pos = bar.watchPoints[j]
            summBar.points.push({pos: pos, temp: bar.temps[pos]})
        }
        
        if (bar.variable != null) {
            summBar.variable = []
            for (var j = 0; j < bar.variable.length; j++)
            {
                var pos = bar.variable[j].pos
                summBar.variable.push({pos: pos, temp: bar.temps[pos], options: bar.variable[j].options})
            }
        }
        bars.push(summBar);
    }
    
    
    
    return {room: "~", bars:bars, score:room.score, joins:room.joins};
}


function iterateRoom(room){
    var alerts = iterateBars(room.bars);
    if (room.joins != null){
        iterateJoins(room.bars, room.joins);
    }
    
    return alerts;
}

function initRoom(roomType)
{
    // Room: {Users: [], name: string, bars: [], roomTemp: int, score: int}
    var newRoom = {score:0, roomTemp:20};
    
    if (roomType == "A")
    {
        newRoom.bars=initBars("A");
    }
    if (roomType == "B")
    {
        newRoom.bars=initBars("B");
        newRoom.roomTemp = 15;
    }
    if (roomType == "C")
    {
        newRoom.bars=initBars("C");
        newRoom.roomTemp = 25;
        
        newRoom.joins = [];
        newRoom.joins.push({sideA: {bar: 0, pos: 9}, sideB: {bar: 1, pos: 2}, temp: 15});
    }
    if (roomType == "D")
    {
        newRoom.bars=initBars("D");
        newRoom.roomTemp = 25;
        
        newRoom.joins = [];
        newRoom.joins.push({sideA: {bar: 0, pos: 4}, sideB: {bar: 2, pos: 0}, temp: 15});
        newRoom.joins.push({sideA: {bar: 2, pos: 2}, sideB: {bar: 1, pos: 1}, temp: 15});
        
    }
    if (roomType == "Group_Easy")
    {
        newRoom.bars=initBars("C");
        newRoom.roomTemp = 25;
    }
    if (roomType == "Group_Medium")
    {
        newRoom.bars=initBars("D");
        newRoom.roomTemp = 25;
        newRoom.joins = [];
        
        newRoom.joins.push({sideA: {bar: 0, pos: 2}, sideB: {bar: 1, pos: 2}, temp: 15});
    }
    if (roomType == "Group_Hard")
    {
        newRoom.bars=initBars("B");
        newRoom.roomTemp = 15;
    }
    return newRoom;
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
        newBar.goals = [{pos:9, temp:10}];
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
function iterateBars(bars){
    
    var goal_reached = true;
    var limit_exceeded = false;
    
    for (bar in bars){
        var nextTemps = [];
          
        for (var i = 0; i < bars[bar].temps.length; i++){
            nextTemps.push(bars[bar].temps[i]);
            
            var secondDerivTX = 0;
            
            if (i == 0){
                secondDerivTX = 
                (-bars[bar].temps[i] + bars[bar].temps[i + 1])/(barDelta*barDelta/1000000);
            } 
            else if (i == bars[bar].temps.length -1)
            {
                secondDerivTX = 
                (bars[bar].temps[i -1] -bars[bar].temps[i])/(barDelta*barDelta/1000000);
            }
            else 
            {
                secondDerivTX = 
                (bars[bar].temps[i -1] - 2* bars[bar].temps[i] + bars[bar].temps[i + 1])/(barDelta*barDelta/1000000);
            }
            
            var diffusivity =  0.000023;
            
            if (bars[bar].material == "Cu"){
            diffusivity = 0.000111;
            }
            if (bars[bar].material == "Fe"){
                diffusivity = 0.000023;
            }
            if (bars[bar].material == "Qu"){
                diffusivity = 0.0000014;
            }
            if (bars[bar].material == "Sn"){
                diffusivity = 0.00004;
            }
        
            var deltaT = secondDerivTX * diffusivity *timeGap/1000;
            nextTemps[i] = bars[bar].temps[i] + deltaT;
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
            if (bars[bar].temps[bars[bar].goals[goal].pos] != bars[bar].goals[goal].temp)
            {
                goal_reached = false;
            }
        }
        nextTemps = [];
    } 
    
    return ({limit_exceeded:limit_exceeded, goal_reached:goal_reached});
}

// Used to update temperatures that cross between bars
// Currently in testing phase
function iterateJoins(bars, joins){
    
    for (var i = 0; i < joins.length; i++)
    {
        var sideA = joins[i].sideA;
        var sideB = joins[i].sideB;

        var secondDerivTX = 
            (bars[sideA.bar].temps[sideA.pos]
                - 2* joins[i].temp + 
                bars[sideB.bar].temps[sideB.pos])
                /(barDelta*barDelta/1000000);
        var diffusivity = 0.000023;
        
        var deltaT = secondDerivTX * diffusivity *timeGap/1000;
        var nextTempJ = joins[i].temp + deltaT;

        secondDerivTX = 
            (joins[i].temp - bars[sideA.bar].temps[sideA.pos]) 
            /(barDelta*barDelta/1000000);
        
        deltaT = secondDerivTX * diffusivity *timeGap/1000;
        var nextTempA = bars[sideA.bar].temps[sideA.pos] + deltaT;
        
        secondDerivTX = 
            (joins[i].temp - bars[sideB.bar].temps[sideB.pos])
            /(barDelta*barDelta/1000000);
        deltaT = secondDerivTX * diffusivity *timeGap/1000;
        var nextTempB = bars[sideB.bar].temps[sideB.pos] + deltaT;
        
        joins[i].temp = nextTempJ;
        
        bars[sideB.bar].temps[sideB.pos] = nextTempB;
        bars[sideA.bar].temps[sideA.pos] = nextTempA;
    }
}

http.listen((process.env.PORT || 3000), function(){
  console.log('listening on *:3000');
});


