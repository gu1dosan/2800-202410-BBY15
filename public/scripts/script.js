toggleShowPassword = () => {
    var x = document.getElementById("password");
    var y = document.getElementById("confirmPassword");
    if (x.type === "password") {
        x.type = "text";
        y.type = "text";
    } else {
        x.type = "password";
        y.type = "password";
    }
}

// promoteToAdmin = (id) => {
//     fetch("/promoteToAdmin", {
//         method: "POST",
//         body: JSON.stringify({id: id}),
//         headers: {
//             "Content-Type": "application/json"
//         }
//     })
//     .then((response) => response.json())
//     .then((response) => {
//         // console.log(response)
//         if(response.success)location.reload()
//     });
// }

// demoteToUser = (id) => {
//     fetch("/demoteToUser", {
//         method: "POST",
//         body: JSON.stringify({id: id}),
//         headers: {
//             "Content-Type": "application/json"
//         }
//     })
//     .then((response) => response.json())
//     .then((response) => {
//         // console.log(response)
//         if(response.success)location.reload()
//     });
// }

if(document.getElementById("loginButton")) {
    document.getElementById("loginButton").onclick = () => {
        location.href = "/login";
    };
}

if(document.getElementById("signupButton")) {
    document.getElementById("signupButton").onclick = () => {
        location.href = "/signup";
    };
}

if(document.getElementById("logoutButton")) {
    document.getElementById("logoutButton").onclick = () => {
        location.href = "/logout";
    };
}