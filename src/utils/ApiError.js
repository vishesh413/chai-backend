class ApiError extends Error {
    constructor(
        statusCode,
        message= "SOmething went wrong",
        errors = [],
        statck = ""
    ){
        super(message) //This is necessary because the Error class needs the message property to be properly initialized. 
        this.statusCode = statusCode
        this.data = null,
        this.message= message
        this.success = false;
        this.errors = errors //errors ka replacement

        if(statck) {
            this.statck = statck

        } else{
            Error.captureStackTrace(this, this.constructor)
        }
        // jab badi file rehti h to statck isliye use krte h jisse kaha kaha pr error hai ye pta chl jaye 
    }
}

export {ApiError}