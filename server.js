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

// serves the public folder to provide static resources
app.use(express.static(__dirname + '/public'));

// only the main route is redirected, there are no other ways to access the app
app.get('/', function(req, res){
    res.sendFile(__dirname + 'index.html');
});

var timeLimitMins = 5; // Any room will time out after 5 minutes, to prevent someone camping a room
var GroupRooms = [];
var barDelta = 5;
var timeGap = 5;
var voteGap = 10000; // time in between group room vote polls
var users = [];
var groupRoomNames = ["Easy", "Medium", "Hard"];
var soloRoomNames = ["A", "B", "C", "D"];

// == generates group rooms for use == //
function InitGroupRooms(){
    
    for( var i = 0; i < groupRoomNames.length; i++)
    {   
        GroupRooms.push({});
        initGroupRoom(i);
    }
    
}

// inits a specific group room, used to refresh rooms after they end.
function initGroupRoom(index)
{
    var newRoom = initRoom(groupRoomNames[index]);
    
    GroupRooms[index] = (newRoom);
}

// intialises all the group rooms on server start
InitGroupRooms();

// Functions first set up when user connects to the socket.io instance
io.on('connection', function(socket){
    
    console.log("new member joined!");
    
    users.push({id: socket.id, room:null});
    
    // fires when users leave a room with the back button
    socket.on("Leave Room", function()
    {   
        var thisUser = getUser(socket.id);
        socket.to(thisUser.room.name).emit("remove user", thisUser.name);
        disconnect_socket_rooms(socket.id);
    });
    
    // updates users on the wait times for rooms.
    socket.on("Join Lobby", function(lobby){
        if (lobby == "Solo")
        {
            socket.emit("updateNav", soloRoomNames);
        }
        if (lobby == "Group")
        {
            socket.emit("updateNav", groupRoomNames);
        }
    });
        
    // fires when users choose to join a solo room
    socket.on("Join Room", function(choice)
    {
        
        console.log(socket.id + " requests to join room " + choice);
        
        var room = null;
        var solo = false;
        var thisUser = getUser(socket.id);
        var channelName;
        
        if (groupRoomNames.indexOf(choice) > -1) {
            
            room = getGroupRoom(choice);
            solo = false;
            
            for (user in room.users)
            {
                socket.emit("add user", room.users[user].name);
            }

            thisUser.name = ("guest" + (room.users.length + 1));
            
            socket.to(room.name).emit('chat message', {source:"system", type:"system", content: thisUser.name +" has joined the channel."});
            socket.to(room.name).emit("add user", thisUser.name);
            
            channelName = room.name;
        }
        else
        if (soloRoomNames.indexOf(choice) > -1)
        {
            room = initRoom(choice);
            solo = true;
            channelName = socket.id;
        }
        else
        {
            socket.emit("No Such Room");
            console.log("No such room found");
            return;
        }
        
        room.users.push(thisUser);
        
        var initVals = summarize(room);
        
        socket.emit("init", initVals);
        
        thisUser.room = room;
       
        socket.join(channelName);
        
        if (room.users.length == 1)
        {   
            // sets the room end time for timeLimit mins in the future
            room.endTime = Date.now() + (timeLimitMins * 60 * 1000);
            room.voteHandle = null;
            room.voteTime = voteGap;
            if (! solo)
            {
                room.voteTime = Date.now() + voteGap;
                
                room.voteHandle = setInterval(function() {
                    resolveVotes(room);
                    io.to(channelName).emit("vote done");
                    room.voteTime = Date.now() + voteGap;
                },
                room.voteTime - Date.now());
            }
                                     
            console.log("Setting Handle");
            room.tickHandle = setInterval(function() {
                var alerts = iterateRoom(room);
                var summary = summarize(room);
                io.to(channelName).emit("update room", {details: summary, elapsedTime : timeGap, timeLeft : room.endTime - Date.now(), voteTime: (room.voteTime - Date.now())});
                
                io.to(channelName).emit("alerts", alerts);
                
                // after the room has ended we clear the handles
                // and remove users from the channel and room after notifying final changes
                if (Date.now() >= room.endTime)
                {
                    clearInterval(room.tickHandle);
                    clearInterval(room.voteHandle);
                    io.to(channelName).emit("Time Finished", {time_exceeded: room.timeExceeded, time_at_goal: room.timeAtGoal, score_profile: room.scoreSheet});
                    
                    if (!solo)
                    {
                        var roomName = socket.room;
                        
                        io.to(channelName).emit("leave channel", channelName);
                        // unsubscribes all clients from this room
                        /*io.sockets.clients(socket.room).forEach(function(listener) {
                        listener.leave(socket.room);
                        }); */
                        
                        initGroupRoom(groupRoomNames.indexOf(room.name));    

                    }
                    
                }
            },
            timeGap);
        }
    });

    socket.on("leave", function(channel){
        socket.leave(channel);
    });
    
    // user requests change to variable heat sources
    socket.on("update sources", function(data){
        
        var thisUser = getUser(socket.id)
        
        if (thisUser.room.solo == false)
        {
            vote(thisUser, data);
            return;
        }        
        for (var i = 0; i < data.temps.length; i++){
            
            thisUser.room.bars[data.bar].temps[data.temps[i].pos] = data.temps[i].temp;

        }
    });
    
    // fires when users leave the website completely
    socket.on('disconnect', function(){
        console.log(socket.id + " has left");
        
        // if the user is not currently in a room, we simply remove then from the users index
        var index = -1;
        for (user in users){
            if (users[user].id == socket.id){
                index = user;
                thisUser = users[user];
            }
        }
        if (index < 0)
        {
            return;
        }

        // if the user was in a group room, tell their room they left
        var room = thisUser.room;
        
        if (room == null)
        {
            return;
        }
        if (room.solo == false)
        {
            io.to(room.name).emit('system message', socket.id + ' has disconnected');
            io.to(groupRoomName).emit('remove user', socket.id);
        }
        
        disconnect_socket_rooms(socket.id);
        
        
        
        
    });
    
    socket.on("vote", function(votes){
        
        var thisUser = getUser(socket.id);
        thisUser.vote = votes;
        
        var room = getUser(socket.id).room;
        io.to(room.name).emit('user voted', thisUser.name);
        
        console.log("User vote recieved " + thisUser.name);
    });
    
    // ------------------------------ used for group chat connections -----------------//
    
    socket.on('chat message', function(msg){
        var room = getUser(socket.id).room;

        socket.broadcast.to(room.name).emit('chat message', {source:getUser(socket.id).name, type:"plain", content: msg});
    });
    // --- end of group chat settings ------------//
});

function disconnect_socket_rooms(socketID)
{
    var thisUser = getUser(socketID);
    var thisRoom = thisUser.room;
    
    var index = -1;
        
    for (user in thisRoom.users)
    {
        if(thisRoom.users[user].id == socketID)
        {
            index = user;
        }
    }
    
    if(index > -1)
    {
        thisRoom.users.splice(index, 1);
        
    }
    
    if (thisRoom.users.length < 1)
    {
        clearInterval(thisRoom.tickHandle);
        clearInterval(thisRoom.voteHandle);
        initGroupRoom(thisRoom.name);
    }
    thisUser.room = null;
        
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
    for ( bar  in room.bars)
    {   
        talley.push([]);
        for(v in room.bars[bar].variable)
        {
            
            talley[bar].push({pos:room.bars[bar].variable[v].pos, values:[]});
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
            for (point in thisVote[bar].values)
            {

                if (thisVote[bar].values[point].pos == talley[thisVote[bar].bar][point].pos)
                {
                    talley[thisVote[bar].bar][point].values.push(thisVote[bar].values[point].temp);
                }
            }
        }
    }  
    
    if (voteCount < 1)
    {
        return;        
    }
    
    for (bar in talley)
    {
        for (point in talley[bar])
        {
            var talleyVal = talley[bar][point];
            room.bars[bar].temps[talleyVal.pos] = getMedian(talleyVal.values);
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

    room.scoreSheet.scoreIncreace.push(scoreMult * alerts.score);
    
    if (room.scoreSheet.times.length > 0)
    {
        room.scoreSheet.times.push(timeGap + room.scoreSheet.times[room.scoreSheet.times.length -1]);
    }
    else
    {
        room.scoreSheet.times.push(timeGap);
    }
    room.scoreSheet.times.push()
    return alerts;
}

function initRoom(roomType)
{
    var newRoom = {score:0, roomTemp:20};

    newRoom.goalReached = false;
    newRoom.limitExceeded = false;
    newRoom.timeAtGoal = 0;
    newRoom.timeExceeded = 0;
    newRoom.users = [];
    newRoom.scoreSheet = {times:[], scoreIncreace:[]};
    newRoom.name = roomType;
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
    if (roomType == "Easy")
    {
        newRoom.bars=initBars("G_Easy");
        newRoom.roomTemp = 25;
        addJoin(newRoom, {bar:0, pos:19}, {bar:1, pos:0})
    }
    if (roomType == "Medium")
    {
        newRoom.bars=initBars("G_Medium");
        newRoom.roomTemp = 25;
        addJoin(newRoom, {bar:0, pos:20}, {bar:2, pos:0});
        addJoin(newRoom, {bar:2, pos:10}, {bar:1, pos:18})
    }
    if (roomType == "Hard")
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
    newBar.globalLimit = 500;
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


    /*
    // fires when users choose to join a solo room
    socket.on("Join Room", function(choice)
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
    
    // fires when users choose to join a group room
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
                    io.to(groupRoom.name).emit("Time Finished", {time_exceeded: groupRoom.room.timeExceeded, time_at_goal: groupRoom.room.timeAtGoal, score_profile: groupRoom.room.scoreSheet});
                    console.log("group room values");
                    console.log(groupRoom);
                    console.log(groupRoom);
                    
                    initGroupRoom( groupRoomNames.indexOf(groupRoom.name));
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
    */