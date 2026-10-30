import type {IncomingMessage,ServerResponse} from "node:http";
import {createProxy} from "../deployment/proxy.ts";
const proxy=createProxy({backendOrigin:process.env.RENDER_API_URL});
export default async function handler(req:IncomingMessage & {query?:Record<string,unknown>},res:ServerResponse){
 const url=new URL(req.url ?? "/", "https://proxy.invalid");
 const route=req.query?.__route ?? url.searchParams.get("__route");
 if(typeof route === "string") req.url="/api/"+route;
 return proxy(req,res);
}
