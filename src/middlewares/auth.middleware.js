import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User} from "../models/user.model.js";
import cookieParser from "cookie-parser";


export const verifyJWT = asyncHandler(async(req, res, next) => {
    // ye wali method tb k liye hai jab humare pass token nhi rahega
    try {
     const token = req.cookie?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
     // yaha par token access kr rhe hai jisse hum logout krwa payein or uske do method hai
     
     console.log(token);
     if(!token) {
         throw new ApiError(401, "Unauthorized request")
    }
 // yaha par jwt verify kyu kar rhe hai 
     const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
 
     const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
 
     if (!user) {
         throw new ApiError(401, "Invalid Access Token")
    }
    // user ki information add kardo aur next par chale jao
     req.user = user;
     next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid access Token")
    
   }
    
})