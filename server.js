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

var rooms = [];
var barDelta = 5;
var timeGap = 5;
var roomTemp = 20;
var userCount = 0;
var users = [];

io.on('connection', function(socket){
    
    console.log("new member joined!");
    
    users.push({id: socket.id, bars:null, handle: null});
    
    socket.on("update sources", function(data){
        
        console.log(data);
        var thisUser = null;
        for (user in users){
            if (users[user].id == socket.id){
                thisUser = users[user];
            }
        }
        
        for (var i = 0; i < data.temps.length; i++){
            thisUser.bars[data.bar].temps[data.temps[i].pos] = data.temps[i].temp;
        }
    });
    
    socket.on("switch room", function(room){
        console.log("user " + socket.id +" switched to " + room);
        
        var thisUser = null;
        for (user in users){
            if (users[user].id == socket.id){
                thisUser = users[user];
            }
        }
        
        clearInterval(user.handle);
        
        var newRoom = initBars(room);
        socket.emit("init", {bars:newRoom, room:room});
        
        
        thisUser.bars = newRoom;
        for (user in users){
            if (user.id == socket.id){
                clearInterval(user.handle);
                break;
            }
        }
        thisUser.handle = setInterval(function() {
           iterateBars(thisUser.bars);
           socket.emit("update bars", {bars: thisUser.bars, elapsedTime : timeGap});
           },
           timeGap);
    });
});

function initBars(roomType){
    var bars = [];
    if (roomType == "A")
    {
        bars.push({id:"A", material:"Cu", temps:[50,20, 30,10,10], fixed:[0, 4]});
    }
    if (roomType == "B")
    {
        bars.push({id:"A", material:"Cu", temps:[70,10, 10,10,10], fixed:[0, 4], variable:[0]});
        bars.push({id:"B", material:"Fe", temps:[5,44, 11,20,10], fixed:[0, 4]});
    }
    if (roomType == "C")
    {
        bars.push({id:"A", material:"Cu", temps:[50,20, 30,10,10], fixed:[0, 4]});
        bars.push({id:"B", material:"Fe", temps:[10, 20, 30, 30, 20, 20, 20, 10, 14, 15, 20], fixed: [6], variable:[6]});
        bars.push({id:"B", material:"Fe", temps:[50,20, 30,10,10], fixed:[0, 3], variable:[0]});
    }
    
    return bars;
}

function iterateBars(bars){

    for (bar in bars){
        var nextTemps = [];
        
        for (var i = 0; i < bars[bar].temps.length; i++){
            nextTemps.push(bars[bar].temps[i]);
            
            var secondDerivTX = 0;
            
            if (i == 0 || i == bars[bar].temps.length -1){
                secondDerivTX = 
                (roomTemp - 2* bars[bar].temps[i] + roomTemp)/(barDelta*barDelta/1000000);
            }   
            else 
            {
                secondDerivTX = 
                (bars[bar].temps[i -1] - 2* bars[bar].temps[i] + bars[bar].temps[i + 1])/(barDelta*barDelta/1000000);
            }
            
            var diffusivity = 0.002;
            
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
        
        for (var i = 0; i <bars[bar].temps.length; i++){
            if (bars[bar].fixed.indexOf(i) == -1) {
                bars[bar].temps[i] = nextTemps[i];
            } else {
                bars[bar].temps[i] = bars[bar].temps[i];
            }
        }
        nextTemps = [];
    } 
    
}

http.listen((process.env.PORT || 3000), function(){
  console.log('listening on *:3000');
});


